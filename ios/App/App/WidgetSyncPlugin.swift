import Foundation
import UIKit
import Capacitor
import WidgetKit

/// Bridges finished-project sticker photos from the web app's localStorage
/// (see syncWidgetFinishedProjects in index.html) into the shared App Group
/// container, so the FinishedProjectsWidget extension can read them without
/// any access to the WKWebView or its storage.
@objc(WidgetSyncPlugin)
public class WidgetSyncPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "WidgetSyncPlugin"
    public let jsName = "WidgetSync"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "syncFinishedProjects", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "syncCurrentProject", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clearCurrentProject", returnType: CAPPluginReturnPromise)
    ]

    private static let thumbnailMaxDimension: CGFloat = 240

    @objc func syncFinishedProjects(_ call: CAPPluginCall) {
        guard let rawItems = call.getArray("items", JSObject.self) else {
            print("[WidgetSync] reject: missing 'items' array")
            call.reject("Missing 'items' array")
            return
        }
        let totalCount = call.getInt("totalCount") ?? rawItems.count
        print("[WidgetSync] syncFinishedProjects called with \(rawItems.count) item(s), totalCount=\(totalCount)")

        guard let thumbsDir = WidgetAppGroup.thumbsDirectoryURL else {
            // containerURL(forSecurityApplicationGroupIdentifier:) returns nil when the
            // App Group entitlement isn't actually provisioned for this build — the
            // most common cause is the capability never having been registered with
            // the Apple Developer account (see project.pbxproj TargetAttributes fix).
            print("[WidgetSync] reject: App Group container is nil — entitlement not provisioned for group '\(WidgetAppGroup.id)'")
            call.reject("App Group container unavailable")
            return
        }
        print("[WidgetSync] shared container resolved at \(thumbsDir.deletingLastPathComponent().path)")

        DispatchQueue.global(qos: .utility).async {
            // Start clean so projects that were deleted or lost their photo
            // don't leave stale thumbnails behind.
            try? FileManager.default.removeItem(at: thumbsDir)
            try? FileManager.default.createDirectory(at: thumbsDir, withIntermediateDirectories: true)

            var manifestItems: [FinishedProjectItem] = []

            for raw in rawItems {
                guard
                    let id = raw["id"] as? String,
                    let title = raw["title"] as? String,
                    let imageString = raw["image"] as? String
                else {
                    print("[WidgetSync] skipping item: missing id/title/image field")
                    continue
                }

                // Accept either a raw base64 string or a full data URL.
                let base64: String
                if let commaIndex = imageString.firstIndex(of: ",") {
                    base64 = String(imageString[imageString.index(after: commaIndex)...])
                } else {
                    base64 = imageString
                }

                guard let data = Data(base64Encoded: base64) else {
                    print("[WidgetSync] skipping '\(title)': base64 decode failed (length=\(base64.count))")
                    continue
                }
                guard let image = UIImage(data: data) else {
                    print("[WidgetSync] skipping '\(title)': UIImage decode failed (\(data.count) bytes)")
                    continue
                }
                guard let thumbnail = Self.resizedThumbnail(image), let pngData = thumbnail.pngData() else {
                    print("[WidgetSync] skipping '\(title)': thumbnail render failed")
                    continue
                }

                let filename = "\(id).png"
                do {
                    try pngData.write(to: thumbsDir.appendingPathComponent(filename))
                } catch {
                    print("[WidgetSync] skipping '\(title)': write failed — \(error.localizedDescription)")
                    continue
                }

                manifestItems.append(FinishedProjectItem(id: id, title: title, filename: filename))
            }

            print("[WidgetSync] wrote \(manifestItems.count)/\(rawItems.count) thumbnail(s), saving manifest")
            FinishedProjectsManifest(items: manifestItems, totalCount: totalCount).save()

            DispatchQueue.main.async {
                WidgetCenter.shared.reloadTimelines(ofKind: "FinishedProjectsWidget")
                print("[WidgetSync] reloadTimelines(ofKind: FinishedProjectsWidget) requested")
                call.resolve(["ok": true, "savedCount": manifestItems.count])
            }
        }
    }

    @objc func syncCurrentProject(_ call: CAPPluginCall) {
        guard let title = call.getString("title") else {
            print("[WidgetSync] syncCurrentProject reject: missing 'title'")
            call.reject("Missing 'title'")
            return
        }

        let snapshot = ProjectSnapshot(
            title: title,
            status: call.getString("status") ?? "In Progress",
            progress: call.getInt("progress") ?? 0,
            rowsCompleted: call.getInt("rowsCompleted") ?? 0,
            totalRows: call.getInt("totalRows") ?? 0,
            updatedAt: Date(),
            nextRoundLabel: call.getString("nextRoundLabel"),
            nextRoundHint: call.getString("nextRoundHint")
        )
        snapshot.save()
        print("[WidgetSync] syncCurrentProject saved '\(title)' at \(snapshot.progress)%")

        WidgetCenter.shared.reloadTimelines(ofKind: "MiitimeWidget")
        print("[WidgetSync] reloadTimelines(ofKind: MiitimeWidget) requested")
        call.resolve(["ok": true])
    }

    @objc func clearCurrentProject(_ call: CAPPluginCall) {
        WidgetAppGroup.sharedDefaults?.removeObject(forKey: WidgetAppGroup.currentProjectKey)
        print("[WidgetSync] clearCurrentProject — no in-progress project, cleared shared snapshot")

        WidgetCenter.shared.reloadTimelines(ofKind: "MiitimeWidget")
        call.resolve(["ok": true])
    }

    private static func resizedThumbnail(_ image: UIImage) -> UIImage? {
        let maxSide = max(image.size.width, image.size.height)
        guard maxSide > 0 else { return nil }
        let scale = min(1, thumbnailMaxDimension / maxSide)
        let targetSize = CGSize(width: image.size.width * scale, height: image.size.height * scale)
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        return UIGraphicsImageRenderer(size: targetSize, format: format).image { _ in
            image.draw(in: CGRect(origin: .zero, size: targetSize))
        }
    }
}
