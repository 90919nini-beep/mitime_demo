import Foundation

/// Looks up translations from Localizable.strings in each *.lproj folder —
/// resolved against the widget extension's own current locale at render time,
/// same as any other system widget (Weather, Calendar, etc.) follows the
/// device's Language & Region setting rather than the app's own in-app
/// language picker.
func widgetLocalizedRowsShort(_ completed: Int, _ total: Int) -> String {
    String(format: NSLocalizedString("widget.current.rows.short", comment: "e.g. 128/200 rows"), completed, total)
}

func widgetLocalizedRowsLong(_ completed: Int, _ total: Int, _ percent: Int) -> String {
    String(format: NSLocalizedString("widget.current.rows.long", comment: "e.g. 128 / 200 rows · 64% complete"), completed, total, percent)
}

func widgetLocalizedProjectCount(_ count: Int) -> String {
    let key = count == 1 ? "widget.finished.count.singular" : "widget.finished.count.plural"
    return String(format: NSLocalizedString(key, comment: "e.g. 5 projects"), count)
}
