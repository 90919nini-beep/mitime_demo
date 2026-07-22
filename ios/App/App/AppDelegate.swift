import UIKit
import Capacitor
import WebKit

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    /// Name of the WKScriptMessageHandler the web app posts to once it has
    /// actually rendered, so the handoff doesn't happen while it's still blank.
    /// This is additive alongside Capacitor's own "bridge" message handler on
    /// the same WKUserContentController — it doesn't touch or replace it.
    private static let readyMessageHandlerName = "nativeSplashReady"

    /// The real app (Capacitor's web view controller), kept here so it can start
    /// loading immediately in the background while the native splash is shown,
    /// instead of only starting once the splash's timer ends.
    private var bridgeViewController: UIViewController?

    /// The handoff to the real app waits for *both* of these — the splash's own
    /// minimum branded duration, and the web app actually signaling it has
    /// rendered — so it never cuts away to a still-loading blank WebView.
    private var minimumDurationElapsed = false
    private var webContentReady = false
    private var didTransition = false

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        guard let window = window else { return true }

        // Start loading the web app now, off-screen, so it has time to finish
        // booting before it's actually shown. The frame must be set to the real
        // screen size *before* loadViewIfNeeded(), otherwise the WebView lays out
        // at whatever default (small/zero) size UIKit gives an unattached view
        // controller, and visibly grows to fill the screen once it's shown.
        let bridgeVC = UIStoryboard(name: "Main", bundle: nil).instantiateInitialViewController()
        bridgeVC?.view.frame = window.bounds
        bridgeVC?.loadViewIfNeeded()
        bridgeVC?.view.layoutIfNeeded()
        bridgeViewController = bridgeVC

        if let capBridgeVC = bridgeVC as? CAPBridgeViewController {
            capBridgeVC.webView?.configuration.userContentController.add(self, name: Self.readyMessageHandlerName)
        }

        let splash = NativeSplashViewController()
        splash.onFinished = { [weak self] in
            self?.minimumDurationElapsed = true
            self?.attemptTransition()
        }
        window.rootViewController = splash
        window.makeKeyAndVisible()

        // Safety net: if the web app never signals readiness for some reason
        // (e.g. a JS error before it can post the message), don't get stuck on
        // the splash forever.
        DispatchQueue.main.asyncAfter(deadline: .now() + 8) { [weak self] in
            self?.webContentReady = true
            self?.attemptTransition()
        }

        return true
    }

    private func attemptTransition() {
        guard minimumDurationElapsed, webContentReady, !didTransition else { return }
        didTransition = true
        transitionToApp()
    }

    private func transitionToApp() {
        guard let window = window, let bridgeVC = bridgeViewController else { return }
        if let capBridgeVC = bridgeVC as? CAPBridgeViewController {
            capBridgeVC.webView?.configuration.userContentController.removeScriptMessageHandler(forName: Self.readyMessageHandlerName)
        }
        // Re-assert the full-screen frame and force layout before the crossfade
        // captures its "after" snapshot, so it's already correctly sized —
        // otherwise the transition can snapshot a mid-layout frame.
        bridgeVC.view.frame = window.bounds
        bridgeVC.view.layoutIfNeeded()
        UIView.transition(with: window, duration: 0.4, options: .transitionCrossDissolve, animations: {
            window.rootViewController = bridgeVC
        })
        bridgeViewController = nil
    }

    func applicationWillResignActive(_ application: UIApplication) {
        // Sent when the application is about to move from active to inactive state. This can occur for certain types of temporary interruptions (such as an incoming phone call or SMS message) or when the user quits the application and it begins the transition to the background state.
        // Use this method to pause ongoing tasks, disable timers, and invalidate graphics rendering callbacks. Games should use this method to pause the game.
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
        // Use this method to release shared resources, save user data, invalidate timers, and store enough application state information to restore your application to its current state in case it is terminated later.
        // If your application supports background execution, this method is called instead of applicationWillTerminate: when the user quits.
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
        // Called as part of the transition from the background to the active state; here you can undo many of the changes made on entering the background.
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        // Restart any tasks that were paused (or not yet started) while the application was inactive. If the application was previously in the background, optionally refresh the user interface.
    }

    func applicationWillTerminate(_ application: UIApplication) {
        // Called when the application is about to terminate. Save data if appropriate. See also applicationDidEnterBackground:.
    }

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        // Called when the app was launched with a url. Feel free to add additional processing here,
        // but if you want the App API to support tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        // Called when the app was launched with an activity, including Universal Links.
        // Feel free to add additional processing here, but if you want the App API to support
        // tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }

}

extension AppDelegate: WKScriptMessageHandler {
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.name == Self.readyMessageHandlerName else { return }
        webContentReady = true
        attemptTransition()
    }
}
