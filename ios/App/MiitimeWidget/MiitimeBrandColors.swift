import SwiftUI

// Sampled straight from the miiitime logo/app icon assets.
let miiBlue = Color(red: 0x77 / 255, green: 0x8E / 255, blue: 0xE3 / 255)       // wordmark blue, matches manifest.json theme_color
let miiDeepBlue = Color(red: 0x27 / 255, green: 0x48 / 255, blue: 0xBE / 255)   // darker shade of the same hue, for gradient depth
let miiGold = Color(red: 0xE3 / 255, green: 0xC2 / 255, blue: 0x77 / 255)       // the logo's star accent

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
}
