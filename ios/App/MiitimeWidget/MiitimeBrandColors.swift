import SwiftUI
import UIKit

// Sampled straight from the miiitime logo/app icon assets.
let miiBlue = Color(red: 0x77 / 255, green: 0x8E / 255, blue: 0xE3 / 255)       // wordmark blue, matches manifest.json theme_color
let miiDeepBlue = Color(red: 0x27 / 255, green: 0x48 / 255, blue: 0xBE / 255)   // darker shade of the same hue, for gradient depth
let miiGold = Color(red: 0xE3 / 255, green: 0xC2 / 255, blue: 0x77 / 255)       // the logo's star accent — decorative fills only

// Adaptive brand-blue accent for small labels/icons that sit directly on
// widgetCardBackground() — dark blue (miiDeepBlue) reads clearly against the
// light cream card, light blue (miiBlue) against the dark one. Swapped in
// for plain .primary (black/white) on request.
let miiBlueText = Color(uiColor: UIColor { traits in
    traits.userInterfaceStyle == .dark
        ? UIColor(red: 0x77 / 255, green: 0x8E / 255, blue: 0xE3 / 255, alpha: 1)   // miiBlue
        : UIColor(red: 0x27 / 255, green: 0x48 / 255, blue: 0xBE / 255, alpha: 1)   // miiDeepBlue
})

let miiBrandGradient = LinearGradient(
    colors: [miiBlue, miiDeepBlue],
    startPoint: .leading,
    endPoint: .trailing
)

extension View {
    @ViewBuilder
    func widgetBackground(_ color: Color) -> some View {
        if #available(iOSApplicationExtension 17.0, *) {
            containerBackground(color, for: .widget)
        } else {
            background(color)
        }
    }

    /// The soft blue/gold blob wash from the Dashboard's "Finished Projects"
    /// card (--fp-base/--fp-blob1-3 in index.html), approximated with radial
    /// gradients since widgets can't do CSS blur — a gradient's own soft edge
    /// reads the same way without needing an actual blur pass.
    @ViewBuilder
    func widgetCardBackground() -> some View {
        if #available(iOSApplicationExtension 17.0, *) {
            containerBackground(for: .widget) { MiiCardBackground() }
        } else {
            background(MiiCardBackground())
        }
    }
}

// The Dashboard "Finished Projects" card's --fp-base/--fp-blob1-3 values,
// light and dark, copied straight from index.html's :root and
// [data-theme="dark"] blocks so the widget genuinely matches instead of
// approximating its own palette.
private extension Color {
    static let fpBaseLight = Color(red: 0xF5 / 255, green: 0xF2 / 255, blue: 0xEC / 255)
    static let fpBaseDark = Color(red: 0x1E / 255, green: 0x1C / 255, blue: 0x2A / 255)
    static let fpBlob1Light = Color(red: 119 / 255, green: 142 / 255, blue: 227 / 255)
    static let fpBlob1Dark = Color(red: 90 / 255, green: 110 / 255, blue: 195 / 255)
    static let fpBlob2Light = Color(red: 220 / 255, green: 185 / 255, blue: 75 / 255)
    static let fpBlob2Dark = Color(red: 155 / 255, green: 130 / 255, blue: 55 / 255)
    static let fpBlob3Light = Color(red: 155 / 255, green: 170 / 255, blue: 230 / 255)
    static let fpBlob3Dark = Color(red: 105 / 255, green: 118 / 255, blue: 200 / 255)
}

private struct MiiCardBackground: View {
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        let isDark = colorScheme == .dark
        ZStack {
            isDark ? Color.fpBaseDark : Color.fpBaseLight
            // blob1 — CSS: top:22%, left:-10%
            RadialGradient(colors: [(isDark ? Color.fpBlob1Dark : Color.fpBlob1Light).opacity(isDark ? 0.48 : 0.50), .clear], center: UnitPoint(x: 0.05, y: 0.3), startRadius: 4, endRadius: 150)
            // blob2 — CSS: bottom:12%, right:-8%
            RadialGradient(colors: [(isDark ? Color.fpBlob2Dark : Color.fpBlob2Light).opacity(isDark ? 0.42 : 0.44), .clear], center: UnitPoint(x: 0.95, y: 0.85), startRadius: 4, endRadius: 150)
            // blob3 — CSS: top:4%, right:14%
            RadialGradient(colors: [(isDark ? Color.fpBlob3Dark : Color.fpBlob3Light).opacity(isDark ? 0.36 : 0.38), .clear], center: UnitPoint(x: 0.83, y: 0.1), startRadius: 4, endRadius: 110)
        }
    }
}
