import UIKit
import Capacitor

class ViewController: CAPBridgeViewController {
    
    override func viewDidLoad() {
        super.viewDidLoad()
        // Do any additional setup after loading the view.
    }
    
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(CAPBridge.self)
        #if DEBUG
        if #available(iOS 16.4, *) {
            bridge?.webView?.isInspectable = true
        }
        #endif
    }
}
