import AuthenticationServices
import Capacitor
import Foundation
import UIKit

@objc(PhotosShellPlugin)
public class PhotosShellPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "PhotosShellPlugin"
    public let jsName = "PhotosShell"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "authorize", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openExternal", returnType: CAPPluginReturnPromise),
    ]

    private var signIn: ASWebAuthenticationSession?

    @objc func authorize(_ call: CAPPluginCall) {
        guard let address = call.getString("url"), let url = URL(string: address), let scheme = call.getString("scheme") else {
            return call.reject("A sign-in needs a url and a callback scheme")
        }
        DispatchQueue.main.async {
            let session = ASWebAuthenticationSession(url: url, callbackURLScheme: scheme) { [weak self] callback, error in
                self?.signIn = nil
                if let callback = callback { return call.resolve(["url": callback.absoluteString]) }
                if (error as? ASWebAuthenticationSessionError)?.code == .canceledLogin { return call.resolve(["cancelled": true]) }
                call.reject(error?.localizedDescription ?? "Sign-in failed")
            }
            session.prefersEphemeralWebBrowserSession = true
            session.presentationContextProvider = self
            self.signIn = session
            session.start()
        }
    }

    @objc func openExternal(_ call: CAPPluginCall) {
        guard let address = call.getString("url"), let url = URL(string: address), ["http", "https"].contains(url.scheme?.lowercased() ?? "") else {
            return call.reject("Only web links can be opened")
        }
        DispatchQueue.main.async {
            UIApplication.shared.open(url)
            call.resolve()
        }
    }
}

extension PhotosShellPlugin: ASWebAuthenticationPresentationContextProviding {
    public func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        bridge?.viewController?.view.window ?? ASPresentationAnchor()
    }
}
