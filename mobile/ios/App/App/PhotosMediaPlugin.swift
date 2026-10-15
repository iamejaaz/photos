import Foundation
import Capacitor

@objc(PhotosMediaPlugin)
public class PhotosMediaPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "PhotosMediaPlugin"
    public let jsName = "PhotosMedia"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "setSession", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "trim", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clear", returnType: CAPPluginReturnPromise),
    ]
    private var folder: URL { FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0].appendingPathComponent("media") }

    @objc func setSession(_ call: CAPPluginCall) {
        let origin = call.getString("origin") ?? "", token = call.getString("token") ?? ""
        DispatchQueue.main.async {
            PhotosMediaHandler.shared.origin = origin
            PhotosMediaHandler.shared.token = token
            call.resolve()
        }
    }

    @objc func clear(_ call: CAPPluginCall) {
        PhotosMediaHandler.shared.clear()
        call.resolve()
    }

    @objc func trim(_ call: CAPPluginCall) {
        let budget = call.getDouble("budgetBytes").map { Int64(min($0, 9e18)) } ?? .max
        let fm = FileManager.default
        guard let folders = try? fm.contentsOfDirectory(at: folder, includingPropertiesForKeys: [.contentModificationDateKey]) else { return call.resolve() }
        var total = folders.reduce(Int64(0)) { $0 + size($1) }
        let modified = { (url: URL) in (try? url.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate) ?? .distantPast }
        for url in folders.sorted(by: { modified($0) < modified($1) }) where total > budget {
            total -= size(url)
            try? fm.removeItem(at: url)
        }
        call.resolve()
    }

    private func size(_ url: URL) -> Int64 {
        let files = (try? FileManager.default.contentsOfDirectory(at: url, includingPropertiesForKeys: [.fileSizeKey])) ?? []
        return files.reduce(0) { $0 + Int64((try? $1.resourceValues(forKeys: [.fileSizeKey]).fileSize) ?? 0) }
    }
}
