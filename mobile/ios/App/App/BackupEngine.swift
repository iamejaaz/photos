import BackgroundTasks
import CryptoKit
import Foundation
import Network
import Photos
import UniformTypeIdentifiers

final class BackupEngine {
    static let shared = BackupEngine()
    static let taskIdentifier = "io.frappe.photos.backup"
    private static let batch = 25

    private let store = BackupStore.shared
    private lazy var client = BackupClient(store: store)
    private let monitor = NWPathMonitor()
    private var path: NWPath?
    private var task: Task<Void, Never>?
    var onStatus: (() -> Void)?

    var running: Bool { task != nil }

    private init() {
        monitor.pathUpdateHandler = { [weak self] path in self?.path = path }
        monitor.start(queue: DispatchQueue(label: "photos.backup.network"))
    }

    func register() {
        BGTaskScheduler.shared.register(forTaskWithIdentifier: Self.taskIdentifier, using: .main) { task in
            guard let task = task as? BGProcessingTask else { return task.setTaskCompleted(success: false) }
            self.schedule()
            let run = self.start()
            task.expirationHandler = { run?.cancel() }
            Task {
                await run?.value
                task.setTaskCompleted(success: true)
            }
        }
    }

    func schedule() {
        guard store.signedIn, store.enabled else {
            BGTaskScheduler.shared.cancel(taskRequestWithIdentifier: Self.taskIdentifier)
            return
        }
        let request = BGProcessingTaskRequest(identifier: Self.taskIdentifier)
        request.requiresNetworkConnectivity = true
        request.earliestBeginDate = Date(timeIntervalSinceNow: 15 * 60)
        try? BGTaskScheduler.shared.submit(request)
    }

    @discardableResult
    func start() -> Task<Void, Never>? {
        dispatchPrecondition(condition: .onQueue(.main))
        if let task = task { return task }
        guard store.signedIn, store.enabled, permission == "granted" || permission == "partial" else { return nil }
        if store.wifiOnly, path?.isExpensive == true { return nil }
        let run = Task {
            await self.run()
            await MainActor.run {
                self.task = nil
                self.onStatus?()
            }
        }
        task = run
        onStatus?()
        return run
    }

    var permission: String {
        switch PHPhotoLibrary.authorizationStatus(for: .readWrite) {
        case .authorized: return "granted"
        case .limited: return "partial"
        case .denied, .restricted: return "denied"
        default: return "prompt"
        }
    }

    private func run() async {
        var skipped: String?
        do {
            let folder = try await client.uploadFolder()
            let items = assets()
            let pending = items.filter { !store.isDone(key($0)) }
            var done = items.count - pending.count
            store.progress(total: items.count, done: done)
            emit()
            for start in stride(from: 0, to: pending.count, by: Self.batch) {
                if Task.isCancelled { break }
                let slice = Array(pending[start..<min(pending.count, start + Self.batch)])
                var exported: [(PHAsset, URL, String, String, String)] = []
                for asset in slice {
                    if Task.isCancelled { break }
                    guard let (file, name, mime) = try? await export(asset) else { continue }
                    guard let hash = try? sha1(file) else {
                        try? FileManager.default.removeItem(at: file)
                        continue
                    }
                    exported.append((asset, file, name, mime, hash))
                }
                defer { exported.forEach { try? FileManager.default.removeItem(at: $0.1) } }
                let wanted = try await client.missing(exported.map { $0.4 })
                for (asset, file, name, mime, hash) in exported {
                    if Task.isCancelled { break }
                    if wanted.contains(hash) {
                        do {
                            let uploaded = try await client.upload(folder: folder, name: name, mime: mime, file: file, modified: asset.creationDate ?? Date())
                            try await client.mark(file: uploaded, sha1: hash)
                        } catch BackupError.rejected(let message) {
                            skipped = "\(name): \(message)"
                            continue
                        }
                    }
                    store.markDone(key(asset))
                    done += 1
                    store.progress(total: items.count, done: done)
                    emit()
                }
            }
            store.finished(skipped)
        } catch {
            store.finished(error.localizedDescription)
        }
        schedule()
    }

    private func assets() -> [PHAsset] {
        let options = PHFetchOptions()
        options.sortDescriptors = [NSSortDescriptor(key: "creationDate", ascending: false)]
        if !store.includeVideos { options.predicate = NSPredicate(format: "mediaType == %d", PHAssetMediaType.image.rawValue) }
        let result = PHAsset.fetchAssets(with: options)
        var assets: [PHAsset] = []
        result.enumerateObjects { asset, _, _ in
            if asset.mediaType == .image || asset.mediaType == .video { assets.append(asset) }
        }
        return assets
    }

    private func key(_ asset: PHAsset) -> String {
        "\(asset.localIdentifier):\(Int(asset.modificationDate?.timeIntervalSince1970 ?? 0))"
    }

    private func export(_ asset: PHAsset) async throws -> (URL, String, String) {
        let resources = PHAssetResource.assetResources(for: asset)
        let preferred: [PHAssetResourceType] = asset.mediaType == .video ? [.fullSizeVideo, .video] : [.fullSizePhoto, .photo]
        guard let resource = preferred.lazy.compactMap({ type in resources.first { $0.type == type } }).first ?? resources.first else {
            throw BackupError.failed("The photo could not be read")
        }
        let name = resources.first { $0.type == .photo || $0.type == .video }?.originalFilename ?? resource.originalFilename
        let file = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString + "-" + name)
        let options = PHAssetResourceRequestOptions()
        options.isNetworkAccessAllowed = true
        try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
            PHAssetResourceManager.default().writeData(for: resource, toFile: file, options: options) { error in
                if let error = error { continuation.resume(throwing: error) } else { continuation.resume() }
            }
        }
        let mime = UTType(resource.uniformTypeIdentifier)?.preferredMIMEType
            ?? UTType(filenameExtension: (name as NSString).pathExtension)?.preferredMIMEType
            ?? "application/octet-stream"
        return (file, name, mime)
    }

    private func sha1(_ file: URL) throws -> String {
        let handle = try FileHandle(forReadingFrom: file)
        defer { try? handle.close() }
        var hasher = Insecure.SHA1()
        while true {
            let data = handle.readData(ofLength: 1 << 20)
            if data.isEmpty { break }
            hasher.update(data: data)
        }
        return hasher.finalize().map { String(format: "%02x", $0) }.joined()
    }

    private func emit() {
        DispatchQueue.main.async { self.onStatus?() }
    }
}
