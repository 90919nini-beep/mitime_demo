import Foundation

/// Has target membership in both App (writes, via WidgetSyncPlugin) and
/// MiitimeWidget (reads, via loadCurrent) — kept in the widget group for
/// history but is not widget-only.
struct ProjectSnapshot: Codable {
    var title: String
    var status: String
    var progress: Int
    var rowsCompleted: Int
    var totalRows: Int
    var updatedAt: Date
    // Real per-round stitch instructions aren't wired up yet (the pattern
    // reader is a canvas-rendered stitch grid, not flat text) — nextRoundHint
    // is a stand-in sourced from the project's own notes until that exists.
    var nextRoundLabel: String?
    var nextRoundHint: String?

    static let placeholder = ProjectSnapshot(
        title: "Granny Cardigan",
        status: "In Progress",
        progress: 52,
        rowsCompleted: 17,
        totalRows: 33,
        updatedAt: Date(),
        nextRoundLabel: "Round 18",
        nextRoundHint: "3 dc, 2 ch, repeat around"
    )

    /// Returns nil when nothing has ever been synced (or the last sync was an
    /// explicit "no project in progress" clear) — callers show a real empty
    /// state rather than falling back to fake placeholder data. `.placeholder`
    /// is only for Xcode canvas previews.
    static func loadCurrent() -> ProjectSnapshot? {
        guard
            let defaults = WidgetAppGroup.sharedDefaults,
            let data = defaults.data(forKey: WidgetAppGroup.currentProjectKey),
            let snapshot = try? JSONDecoder().decode(ProjectSnapshot.self, from: data)
        else {
            return nil
        }
        return snapshot
    }

    func save() {
        guard let data = try? JSONEncoder().encode(self) else { return }
        WidgetAppGroup.sharedDefaults?.set(data, forKey: WidgetAppGroup.currentProjectKey)
    }
}
