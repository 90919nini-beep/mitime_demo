import Foundation
import UIKit
import AuthenticationServices
import Capacitor

/// Native "Sign in with Apple" for the web app's signInWithApple() (see the
/// Cloud Auth section of index.html) — presents Apple's system sheet via
/// AuthenticationServices and hands the resulting identity token back to JS,
/// which forwards it to Supabase's `signInWithIdToken()`. Nonce hashing
/// happens on the JS side (generateNonce/sha256Hex in index.html): this
/// plugin only ever sees the already-hashed nonce, matching Apple's own
/// requirement that `request.nonce` carry the SHA-256 digest while the raw
/// value is what actually gets verified server-side against the hash
/// embedded in the returned token.
@objc(AppleSignInPlugin)
public class AppleSignInPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "AppleSignInPlugin"
    public let jsName = "AppleSignIn"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "signIn", returnType: CAPPluginReturnPromise)
    ]

    // ASAuthorizationController only holds a *weak* reference to its delegate,
    // so something has to keep it (and the CAPPluginCall it's resolving)
    // alive for the duration of the async system-sheet flow. Held per plugin
    // instance (a singleton owned by the bridge) rather than as a local, and
    // cleared once the flow finishes either way.
    private var activeDelegate: AppleSignInDelegate?

    @objc func signIn(_ call: CAPPluginCall) {
        guard let nonceHash = call.getString("nonceHash"), !nonceHash.isEmpty else {
            call.reject("Missing 'nonceHash'")
            return
        }

        // ASAuthorizationController must be created/driven on the main thread —
        // Capacitor dispatches plugin methods off it by default.
        DispatchQueue.main.async { [weak self] in
            let request = ASAuthorizationAppleIDProvider().createRequest()
            request.requestedScopes = [.fullName, .email]
            request.nonce = nonceHash

            let delegate = AppleSignInDelegate(call: call) { [weak self] in
                self?.activeDelegate = nil
            }
            self?.activeDelegate = delegate

            let controller = ASAuthorizationController(authorizationRequests: [request])
            controller.delegate = delegate
            controller.presentationContextProvider = delegate
            controller.performRequests()
        }
    }
}

/// Bridges ASAuthorizationControllerDelegate's callback-based API to the
/// pending CAPPluginCall, and supplies the window Apple's system sheet
/// anchors to.
private final class AppleSignInDelegate: NSObject, ASAuthorizationControllerDelegate, ASAuthorizationControllerPresentationContextProviding {
    private let call: CAPPluginCall
    private let onFinished: () -> Void

    init(call: CAPPluginCall, onFinished: @escaping () -> Void) {
        self.call = call
        self.onFinished = onFinished
    }

    func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
        let keyWindow = UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .flatMap { $0.windows }
            .first { $0.isKeyWindow }
        return keyWindow ?? ASPresentationAnchor()
    }

    func authorizationController(controller: ASAuthorizationController, didCompleteWithAuthorization authorization: ASAuthorization) {
        defer { onFinished() }
        guard let credential = authorization.credential as? ASAuthorizationAppleIDCredential else {
            call.reject("Unexpected credential type from Apple")
            return
        }
        guard let tokenData = credential.identityToken,
              let identityToken = String(data: tokenData, encoding: .utf8) else {
            call.reject("Apple did not return an identity token")
            return
        }
        // email/fullName are only ever present on the *first* authorization for
        // a given Apple ID + app — Supabase's signInWithIdToken() reads the
        // email out of the identity token itself, so nothing else from this
        // credential needs to cross the bridge for the existing JS contract
        // (`const{identityToken}=await ...AppleSignIn.signIn(...)`).
        call.resolve(["identityToken": identityToken])
    }

    func authorizationController(controller: ASAuthorizationController, didCompleteWithError error: Error) {
        defer { onFinished() }
        if let authError = error as? ASAuthorizationError, authError.code == .canceled {
            call.reject("Sign in with Apple was canceled", "canceled")
            return
        }
        call.reject(error.localizedDescription, nil, error)
    }
}
