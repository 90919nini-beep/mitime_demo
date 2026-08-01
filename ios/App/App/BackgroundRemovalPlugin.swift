import Foundation
import UIKit
import Vision
import CoreImage
import Capacitor

/// On-device ML background removal for the "Finished Photo" sticker feature,
/// using Vision's foreground instance segmentation (iOS 17+). This is meant
/// as a more accurate alternative to the JS canvas flood-fill heuristic in
/// www/index.html (applyBgRemovalCanvas) — that one stays in place as the
/// fallback for web users and for devices below iOS 17, where this plugin
/// simply won't be registered/available and the JS side falls back on its own.
@objc(BackgroundRemovalPlugin)
public class BackgroundRemovalPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "BackgroundRemovalPlugin"
    public let jsName = "BackgroundRemoval"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "removeBackground", returnType: CAPPluginReturnPromise)
    ]

    @objc func removeBackground(_ call: CAPPluginCall) {
        guard let base64 = call.getString("image") else {
            call.reject("Missing 'image' string")
            return
        }
        // Accept either a raw base64 string or a full data URL.
        let base64Data: String
        if let commaIndex = base64.firstIndex(of: ",") {
            base64Data = String(base64[base64.index(after: commaIndex)...])
        } else {
            base64Data = base64
        }
        guard let imageData = Data(base64Encoded: base64Data),
              let uiImage = UIImage(data: imageData) else {
            call.reject("Could not decode image data")
            return
        }

        guard #available(iOS 17.0, *) else {
            call.reject("Requires iOS 17 or later")
            return
        }

        // Bake the EXIF orientation into the pixel buffer up front. `uiImage.cgImage`
        // is the raw sensor buffer — its width/height don't necessarily match
        // `uiImage.size` (the visually-upright dimensions) whenever the photo carries
        // a rotation flag, which is the common case for portrait phone photos. Vision's
        // mask reflects the *upright* orientation, so compositing it straight against
        // the raw buffer's dimensions stretches it to the wrong aspect ratio — a
        // squeezed-looking cutout. Rendering through UIGraphicsImageRenderer produces
        // one upright buffer with no rotation metadata left to reconcile, so the mask
        // and base image are always identically shaped.
        let format = UIGraphicsImageRendererFormat()
        format.scale = uiImage.scale
        let uprightImage = UIGraphicsImageRenderer(size: uiImage.size, format: format).image { _ in
            uiImage.draw(at: .zero)
        }
        guard let cgImage = uprightImage.cgImage else {
            call.reject("Could not normalize image orientation")
            return
        }

        DispatchQueue.global(qos: .userInitiated).async {
            do {
                let request = VNGenerateForegroundInstanceMaskRequest()
                let handler = VNImageRequestHandler(cgImage: cgImage, orientation: .up)
                try handler.perform([request])

                guard let result = request.results?.first, !result.allInstances.isEmpty else {
                    DispatchQueue.main.async { call.reject("No foreground subject found") }
                    return
                }

                // NOTE: generateMaskedImage(ofInstances:from:croppedToInstancesExtent:)
                // returns an already color-composited image (original colors with the
                // background zeroed out) — not a plain alpha mask. Treating that as a
                // grayscale mask (as this used to) converts each foreground pixel's own
                // color/luminance into its "alpha", so only a subject's brightest tones
                // stayed visible while its own shadows/midtones faded out. generateMask
                // returns the actual single-channel instance mask we want here.
                let maskBuffer = try result.generateMask(forInstances: result.allInstances)
                let maskCI = CIImage(cvPixelBuffer: maskBuffer)
                let ciContext = CIContext()
                guard let maskCG = ciContext.createCGImage(maskCI, from: maskCI.extent) else {
                    DispatchQueue.main.async { call.reject("Failed to render mask") }
                    return
                }

                guard let cutout = Self.applyAlphaMask(maskCG, to: cgImage),
                      let pngData = cutout.pngData() else {
                    DispatchQueue.main.async { call.reject("Failed to composite cutout") }
                    return
                }

                // Returning the PNG inline as a base64 string here (as this used to) hands
                // Capacitor's bridge a multi-megabyte string to encode into a JS-evaluation
                // call — a well-known trigger for the bridge's own internal concurrency
                // issues on large payloads (visible in Xcode as "unsafeForcedSync called
                // from Swift Concurrent context", and on device as a freeze/crash). Writing
                // to a temp file and returning just the path keeps the bridge round-trip
                // tiny; the JS side reads the file itself via Capacitor.convertFileSrc.
                let tmpURL = FileManager.default.temporaryDirectory
                    .appendingPathComponent("bgremoval_\(UUID().uuidString).png")
                do {
                    try pngData.write(to: tmpURL)
                } catch {
                    DispatchQueue.main.async { call.reject("Failed to write result: \(error.localizedDescription)") }
                    return
                }

                DispatchQueue.main.async {
                    call.resolve(["path": tmpURL.absoluteString])
                }
            } catch {
                DispatchQueue.main.async {
                    call.reject("Vision request failed: \(error.localizedDescription)")
                }
            }
        }
    }

    /// Composites the (grayscale) foreground mask as the alpha channel of the
    /// original image, producing a transparent-background PNG.
    private static func applyAlphaMask(_ maskCG: CGImage, to originalCG: CGImage) -> UIImage? {
        let width = originalCG.width
        let height = originalCG.height
        let colorSpace = CGColorSpaceCreateDeviceRGB()

        guard let context = CGContext(
            data: nil, width: width, height: height, bitsPerComponent: 8, bytesPerRow: width * 4,
            space: colorSpace, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
        ) else { return nil }
        context.draw(originalCG, in: CGRect(x: 0, y: 0, width: width, height: height))
        guard let origData = context.data else { return nil }
        let origPtr = origData.bindMemory(to: UInt8.self, capacity: width * height * 4)

        guard let maskContext = CGContext(
            data: nil, width: width, height: height, bitsPerComponent: 8, bytesPerRow: width,
            space: CGColorSpaceCreateDeviceGray(), bitmapInfo: CGImageAlphaInfo.none.rawValue
        ) else { return nil }
        maskContext.draw(maskCG, in: CGRect(x: 0, y: 0, width: width, height: height))
        guard let maskData = maskContext.data else { return nil }
        let maskPtr = maskData.bindMemory(to: UInt8.self, capacity: width * height)

        // `context` holds premultiplied-alpha pixels (R/G/B already scaled by
        // alpha), which was 255 everywhere since the original photo is opaque —
        // so at this point R/G/B still equal their straight (un-premultiplied)
        // values. Simply overwriting the alpha byte with the mask value, without
        // rescaling R/G/B to match, leaves invalid premultiplied pixels (color >
        // alpha) wherever the mask lowers alpha — Core Graphics renders those as
        // blown-out, glowing highlights instead of a clean transparent fade.
        for i in 0..<(width * height) {
            let a = maskPtr[i]
            let ratio = Float(a) / 255
            let base = i * 4
            origPtr[base] = UInt8(Float(origPtr[base]) * ratio)
            origPtr[base + 1] = UInt8(Float(origPtr[base + 1]) * ratio)
            origPtr[base + 2] = UInt8(Float(origPtr[base + 2]) * ratio)
            origPtr[base + 3] = a
        }

        guard let finalCG = context.makeImage() else { return nil }
        return UIImage(cgImage: finalCG)
    }
}
