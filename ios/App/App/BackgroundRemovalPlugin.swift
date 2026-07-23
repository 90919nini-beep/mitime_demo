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
              let uiImage = UIImage(data: imageData),
              let cgImage = uiImage.cgImage else {
            call.reject("Could not decode image data")
            return
        }

        guard #available(iOS 17.0, *) else {
            call.reject("Requires iOS 17 or later")
            return
        }

        DispatchQueue.global(qos: .userInitiated).async {
            do {
                let request = VNGenerateForegroundInstanceMaskRequest()
                let handler = VNImageRequestHandler(
                    cgImage: cgImage,
                    orientation: Self.cgOrientation(from: uiImage.imageOrientation)
                )
                try handler.perform([request])

                guard let result = request.results?.first, !result.allInstances.isEmpty else {
                    DispatchQueue.main.async { call.reject("No foreground subject found") }
                    return
                }

                let maskBuffer = try result.generateMaskedImage(
                    ofInstances: result.allInstances,
                    from: handler,
                    croppedToInstancesExtent: false
                )
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

                DispatchQueue.main.async {
                    call.resolve(["image": "data:image/png;base64,\(pngData.base64EncodedString())"])
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

    private static func cgOrientation(from uiOrientation: UIImage.Orientation) -> CGImagePropertyOrientation {
        switch uiOrientation {
        case .up: return .up
        case .down: return .down
        case .left: return .left
        case .right: return .right
        case .upMirrored: return .upMirrored
        case .downMirrored: return .downMirrored
        case .leftMirrored: return .leftMirrored
        case .rightMirrored: return .rightMirrored
        @unknown default: return .up
        }
    }
}
