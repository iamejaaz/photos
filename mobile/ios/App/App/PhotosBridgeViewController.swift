import UIKit
import Capacitor
import WebKit

class PhotosBridgeViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(PhotosShellPlugin())
        bridge?.registerPluginInstance(PhotosSocketPlugin())
        bridge?.registerPluginInstance(PhotosMediaPlugin())
        bridge?.registerPluginInstance(PhotosBackupPlugin())
    }

    override func webViewConfiguration(for instanceConfiguration: InstanceConfiguration) -> WKWebViewConfiguration {
        let configuration = super.webViewConfiguration(for: instanceConfiguration)
        configuration.setURLSchemeHandler(PhotosMediaHandler.shared, forURLScheme: "photos-media")
        return configuration
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        webView?.allowsBackForwardNavigationGestures = true
        let background = UIColor { trait in
            trait.userInterfaceStyle == .dark
                ? UIColor(red: 0x17 / 255.0, green: 0x17 / 255.0, blue: 0x17 / 255.0, alpha: 1)
                : .white
        }
        view.backgroundColor = background
        webView?.backgroundColor = background
        webView?.scrollView.backgroundColor = background
        webView?.underPageBackgroundColor = background
    }
}
