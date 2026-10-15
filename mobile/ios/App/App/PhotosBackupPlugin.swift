import Capacitor
import Foundation
import Photos
import UIKit

@objc(PhotosBackupPlugin)
public class PhotosBackupPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "PhotosBackupPlugin"
    public let jsName = "PhotosBackup"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "configure", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getStatus", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setOptions", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestPermission", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "runNow", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "signOut", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "saveToDevice", returnType: CAPPluginReturnPromise),
    ]

    private let store = BackupStore.shared
    private let engine = BackupEngine.shared

    override public func load() {
        engine.onStatus = { [weak self] in
            guard let self = self else { return }
            self.notifyListeners("status", data: self.status())
        }
        NotificationCenter.default.addObserver(forName: UIApplication.didBecomeActiveNotification, object: nil, queue: .main) { [weak self] _ in
            self?.engine.start()
        }
    }

    private func status() -> [String: Any] {
        [
            "enabled": store.enabled,
            "wifiOnly": store.wifiOnly,
            "includeVideos": store.includeVideos,
            "permission": engine.permission,
            "running": engine.running,
            "total": store.total,
            "done": store.done,
            "lastRun": store.lastRun > 0 ? store.lastRun : NSNull(),
            "lastError": store.lastError.isEmpty ? NSNull() : store.lastError,
            "signedIn": store.signedIn,
            "site": store.site,
            "user": store.user,
        ]
    }

    @objc func configure(_ call: CAPPluginCall) {
        let site = call.getString("site") ?? "", clientId = call.getString("clientId") ?? "", refresh = call.getString("refreshToken") ?? ""
        guard !site.isEmpty, !clientId.isEmpty, !refresh.isEmpty else { return call.reject("site, clientId and refreshToken are required") }
        store.signIn(site: site, user: call.getString("user") ?? "", clientId: clientId,
                     accessToken: call.getString("accessToken") ?? "", refreshToken: refresh,
                     expiresIn: call.getDouble("expiresIn") ?? 3600)
        engine.schedule()
        DispatchQueue.main.async {
            self.engine.start()
            call.resolve(self.status())
        }
    }

    @objc func getStatus(_ call: CAPPluginCall) { call.resolve(status()) }

    @objc func setOptions(_ call: CAPPluginCall) {
        if let enabled = call.getBool("enabled") { store.enabled = enabled }
        if let wifiOnly = call.getBool("wifiOnly") { store.wifiOnly = wifiOnly }
        if let videos = call.getBool("includeVideos") { store.includeVideos = videos }
        engine.schedule()
        DispatchQueue.main.async {
            self.engine.start()
            call.resolve(self.status())
        }
    }

    @objc func requestPermission(_ call: CAPPluginCall) {
        PHPhotoLibrary.requestAuthorization(for: .readWrite) { _ in
            DispatchQueue.main.async {
                self.engine.start()
                call.resolve(self.status())
            }
        }
    }

    @objc func runNow(_ call: CAPPluginCall) {
        DispatchQueue.main.async { self.engine.start() }
        call.resolve()
    }

    @objc func signOut(_ call: CAPPluginCall) {
        let site = store.site, clientId = store.clientId, token = store.refreshToken
        store.signOut()
        engine.schedule()
        if !site.isEmpty, !token.isEmpty { BackupClient.revoke(site: site, clientId: clientId, refreshToken: token) }
        call.resolve()
    }

    @objc func saveToDevice(_ call: CAPPluginCall) {
        guard let address = call.getString("url"), let url = URL(string: address) else { return call.reject("A download needs a url") }
        let name = call.getString("name") ?? "download"
        var request = URLRequest(url: url)
        for (key, value) in call.getObject("headers") ?? [:] { request.setValue("\(value)", forHTTPHeaderField: key) }
        URLSession.shared.downloadTask(with: request) { location, response, error in
            guard let location = location, let http = response as? HTTPURLResponse, http.statusCode < 400 else {
                return call.reject(error?.localizedDescription ?? "The download failed")
            }
            let file = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString + "-" + name)
            do { try FileManager.default.moveItem(at: location, to: file) } catch { return call.reject(error.localizedDescription) }
            let isVideo = (http.mimeType ?? "").hasPrefix("video/")
            let isImage = (http.mimeType ?? "").hasPrefix("image/")
            guard isVideo || isImage else {
                DispatchQueue.main.async { self.share(file, call) }
                return
            }
            PHPhotoLibrary.requestAuthorization(for: .addOnly) { status in
                guard status == .authorized || status == .limited else { return call.reject("Allow Photos to add to your library") }
                PHPhotoLibrary.shared().performChanges({
                    let request = PHAssetCreationRequest.forAsset()
                    let options = PHAssetResourceCreationOptions()
                    options.originalFilename = name
                    request.addResource(with: isVideo ? .video : .photo, fileURL: file, options: options)
                }) { success, error in
                    try? FileManager.default.removeItem(at: file)
                    success ? call.resolve() : call.reject(error?.localizedDescription ?? "Could not save")
                }
            }
        }.resume()
    }

    private func share(_ file: URL, _ call: CAPPluginCall) {
        guard let controller = bridge?.viewController else { return call.reject("Nothing to show the file in") }
        let sheet = UIActivityViewController(activityItems: [file], applicationActivities: nil)
        sheet.popoverPresentationController?.sourceView = controller.view
        controller.present(sheet, animated: true)
        call.resolve()
    }
}
