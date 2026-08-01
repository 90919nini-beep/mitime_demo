import Foundation

/// Shared between the App target (writes) and the MiitimeWidget extension
/// target (reads) — this file has target membership in both.
enum WidgetAppGroup {
    static let id = "group.com.miiitime.app"
    static let thumbsDirectoryName = "WidgetThumbs"
    static let currentProjectKey = "currentProjectSnapshot"
    static let finishedProjectsManifestKey = "finishedProjectsManifest"

    static var sharedDefaults: UserDefaults? {
        UserDefaults(suiteName: id)
    }

    static var containerURL: URL? {
        FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: id)
    }

    static var thumbsDirectoryURL: URL? {
        containerURL?.appendingPathComponent(thumbsDirectoryName, isDirectory: true)
    }
}

struct FinishedProjectItem: Codable, Identifiable {
    let id: String
    let title: String
    let filename: String
}

struct FinishedProjectsManifest: Codable {
    var items: [FinishedProjectItem]
    var totalCount: Int

    static let empty = FinishedProjectsManifest(items: [], totalCount: 0)

    static func loadCurrent() -> FinishedProjectsManifest {
        guard
            let defaults = WidgetAppGroup.sharedDefaults,
            let data = defaults.data(forKey: WidgetAppGroup.finishedProjectsManifestKey),
            let manifest = try? JSONDecoder().decode(FinishedProjectsManifest.self, from: data)
        else {
            return .empty
        }
        return manifest
    }

    func save() {
        guard let data = try? JSONEncoder().encode(self) else { return }
        WidgetAppGroup.sharedDefaults?.set(data, forKey: WidgetAppGroup.finishedProjectsManifestKey)
    }
}
