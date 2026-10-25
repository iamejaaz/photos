import AuthenticationServices
import Capacitor
import Foundation
import LocalAuthentication
import UIKit

@objc(PhotosShellPlugin)
public class PhotosShellPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "PhotosShellPlugin"
    public let jsName = "PhotosShell"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "authorize", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openExternal", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "screenLockAvailable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "confirmScreenLock", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "captureScreen", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setLandscape", returnType: CAPPluginReturnPromise),
    ]

    private static let screenshotSide: CGFloat = 1280
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
            session.prefersEphemeralWebBrowserSession = false
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

    @objc func screenLockAvailable(_ call: CAPPluginCall) {
        call.resolve(["available": LAContext().canEvaluatePolicy(.deviceOwnerAuthentication, error: nil)])
    }

    @objc func confirmScreenLock(_ call: CAPPluginCall) {
        let context = LAContext()
        context.evaluatePolicy(.deviceOwnerAuthentication, localizedReason: call.getString("title") ?? "Unlock") { confirmed, _ in
            call.resolve(["confirmed": confirmed])
        }
    }

    @objc func captureScreen(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard let view = self.bridge?.viewController?.view, view.bounds.width > 0, view.bounds.height > 0 else {
                return call.reject("Nothing to capture")
            }
            let format = UIGraphicsImageRendererFormat()
            format.scale = min(UIScreen.main.scale, Self.screenshotSide / max(view.bounds.width, view.bounds.height))
            let image = UIGraphicsImageRenderer(bounds: view.bounds, format: format).image { _ in
                view.drawHierarchy(in: view.bounds, afterScreenUpdates: true)
            }
            guard let data = image.jpegData(compressionQuality: 0.8) else { return call.reject("Could not capture the screen") }
            call.resolve(["dataUrl": "data:image/jpeg;base64," + data.base64EncodedString()])
        }
    }

    @objc func setLandscape(_ call: CAPPluginCall) {
        let landscape = call.getBool("landscape") ?? false
        DispatchQueue.main.async {
            AppDelegate.orientations = landscape ? .landscape : .allButUpsideDown
            if #available(iOS 16.0, *) {
                self.bridge?.viewController?.setNeedsUpdateOfSupportedInterfaceOrientations()
                self.bridge?.viewController?.view.window?.windowScene?.requestGeometryUpdate(
                    UIWindowScene.GeometryPreferences.iOS(interfaceOrientations: landscape ? .landscape : .portrait)
                )
            }
            call.resolve()
        }
    }
}

extension PhotosShellPlugin: ASWebAuthenticationPresentationContextProviding {
    public func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        bridge?.viewController?.view.window ?? ASPresentationAnchor()
    }
}
