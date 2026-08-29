import Foundation
import UIKit
import GoogleSignIn
import Capacitor

/// Native "Continue with Google" for the web app's signInWithGoogle() (see
/// the Cloud Auth section of index.html) — presents Google's native account
/// picker via GoogleSignIn-iOS and hands the resulting ID token + access
/// token back to JS, which forwards both to Supabase's `signInWithIdToken()`.
///
/// Nonce handling mirrors AppleSignInPlugin's exactly (see its doc comment),
/// not the plain-OIDC "same raw value everywhere" scheme an earlier version
/// of this file assumed — that assumption was wrong and failed real-device
/// testing with "Nonces mismatch". Supabase Auth's `signInWithIdToken()`
/// always SHA-256-hashes whatever `nonce` you pass it and compares that
/// against the ID token's own `nonce` claim, for every provider alike. So
/// the *hash* has to be what ends up embedded in the token (i.e. what this
/// plugin hands to Google), while the *raw* value is what JS sends to
/// Supabase — same two-step Apple already does, just reusing GoogleSignIn-
/// iOS's own `nonce:` parameter (>= 9.0.0, required for it to exist at all)
/// as the place to put the hash instead of the raw value.
@objc(GoogleSignInPlugin)
public class GoogleSignInPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "GoogleSignInPlugin"
    public let jsName = "GoogleSignIn"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "signIn", returnType: CAPPluginReturnPromise)
    ]

    @objc func signIn(_ call: CAPPluginCall) {
        guard let nonceHash = call.getString("nonceHash"), !nonceHash.isEmpty else {
            call.reject("Missing 'nonceHash'")
            return
        }

        // GIDSignIn must be driven on the main thread — Capacitor dispatches
        // plugin methods off it by default.
        DispatchQueue.main.async {
            guard let presentingVC = Self.topViewController() else {
                call.reject("No presenting view controller available")
                return
            }

            GIDSignIn.sharedInstance.signIn(
                withPresenting: presentingVC,
                hint: nil,
                additionalScopes: nil,
                nonce: nonceHash
            ) { result, error in
                if let nsError = error as NSError?,
                   nsError.domain == kGIDSignInErrorDomain,
                   nsError.code == GIDSignInError.canceled.rawValue {
                    call.reject("Google sign-in was canceled", "canceled")
                    return
                }
                if let error = error {
                    call.reject(error.localizedDescription, nil, error)
                    return
                }
                guard let user = result?.user, let idToken = user.idToken?.tokenString else {
                    call.reject("Google did not return an ID token")
                    return
                }
                call.resolve([
                    "idToken": idToken,
                    "accessToken": user.accessToken.tokenString
                ])
            }
        }
    }

    /// Same window-lookup approach AppleSignInPlugin uses for its
    /// presentation anchor, generalized to a view controller (what
    /// GIDSignIn's API wants) and walking down through any already-presented
    /// view controller — GIDSignIn.signIn(withPresenting:) requires the
    /// *topmost* presented controller, not just the window's root.
    private static func topViewController() -> UIViewController? {
        let keyWindow = UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .flatMap { $0.windows }
            .first { $0.isKeyWindow }
        var top = keyWindow?.rootViewController
        while let presented = top?.presentedViewController {
            top = presented
        }
        return top
    }
}
