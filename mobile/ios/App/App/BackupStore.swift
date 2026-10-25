import CryptoKit
import Foundation
import Security

final class BackupStore {
    static let shared = BackupStore()

    private let defaults = UserDefaults.standard
    private let lock = NSLock()
    private var doneHashes: [String: String]?

    var site: String { defaults.string(forKey: "photos.backup.site") ?? "" }
    var user: String { defaults.string(forKey: "photos.backup.user") ?? "" }
    var clientId: String { defaults.string(forKey: "photos.backup.clientId") ?? "" }
    var expiresAt: Date { Date(timeIntervalSince1970: defaults.double(forKey: "photos.backup.expiresAt")) }
    var accessToken: String { keychain("access") ?? "" }
    var refreshToken: String { keychain("refresh") ?? "" }
    var signedIn: Bool { !site.isEmpty && !refreshToken.isEmpty }

    var enabled: Bool {
        get { defaults.bool(forKey: "photos.backup.enabled") }
        set { defaults.set(newValue, forKey: "photos.backup.enabled") }
    }
    var wifiOnly: Bool {
        get { defaults.object(forKey: "photos.backup.wifiOnly") as? Bool ?? true }
        set { defaults.set(newValue, forKey: "photos.backup.wifiOnly") }
    }
    var includeVideos: Bool {
        get { defaults.object(forKey: "photos.backup.includeVideos") as? Bool ?? true }
        set { defaults.set(newValue, forKey: "photos.backup.includeVideos") }
    }
    var total: Int { defaults.integer(forKey: "photos.backup.total") }
    var done: Int { defaults.integer(forKey: "photos.backup.done") }
    var lastRun: Double { defaults.double(forKey: "photos.backup.lastRun") }
    var lastError: String { defaults.string(forKey: "photos.backup.lastError") ?? "" }

    func signIn(site: String, user: String, clientId: String, accessToken: String, refreshToken: String, expiresIn: Double) {
        if site != self.site || user != self.user { resetDoneCache() }
        defaults.set(site, forKey: "photos.backup.site")
        defaults.set(user, forKey: "photos.backup.user")
        defaults.set(clientId, forKey: "photos.backup.clientId")
        saveTokens(accessToken: accessToken, refreshToken: refreshToken, expiresIn: expiresIn)
    }

    func saveTokens(accessToken: String, refreshToken: String, expiresIn: Double) {
        setKeychain("access", accessToken)
        setKeychain("refresh", refreshToken)
        defaults.set(Date().timeIntervalSince1970 + expiresIn, forKey: "photos.backup.expiresAt")
    }

    func signOut() {
        for key in ["site", "user", "clientId", "expiresAt", "total", "done"] { defaults.removeObject(forKey: "photos.backup.\(key)") }
        enabled = false
        setKeychain("access", nil)
        setKeychain("refresh", nil)
        resetDoneCache()
    }

    func progress(total: Int, done: Int) {
        defaults.set(total, forKey: "photos.backup.total")
        defaults.set(done, forKey: "photos.backup.done")
    }

    func finished(_ error: String?) {
        defaults.set(Date().timeIntervalSince1970 * 1000, forKey: "photos.backup.lastRun")
        defaults.set(error ?? "", forKey: "photos.backup.lastError")
    }

    func isDone(_ key: String) -> Bool {
        lock.lock()
        defer { lock.unlock() }
        return loadDone()[key] != nil
    }

    func hashOf(_ key: String) -> String? {
        lock.lock()
        defer { lock.unlock() }
        guard let hash = loadDone()[key], !hash.isEmpty else { return nil }
        return hash
    }

    func markDone(_ key: String, hash: String? = nil) {
        lock.lock()
        defer { lock.unlock() }
        var done = loadDone()
        done[key] = hash ?? done[key] ?? ""
        doneHashes = done
        try? JSONEncoder().encode(done).write(to: doneFile, options: .atomic)
    }

    private func resetDoneCache() {
        lock.lock()
        defer { lock.unlock() }
        doneHashes = nil
    }

    private var folder: URL {
        let folder = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        try? FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        return folder
    }

    private var doneFile: URL {
        let account = SHA256.hash(data: Data("\(site)|\(user)".utf8)).prefix(8).map { String(format: "%02x", $0) }.joined()
        return folder.appendingPathComponent("backup-done-\(account).json")
    }

    private func loadDone() -> [String: String] {
        if let done = doneHashes { return done }
        var done = (try? Data(contentsOf: doneFile)).flatMap { try? JSONDecoder().decode([String: String].self, from: $0) }
        if done == nil {
            let legacy = folder.appendingPathComponent("backup-done.json")
            let keys = (try? Data(contentsOf: legacy)).flatMap { try? JSONDecoder().decode([String].self, from: $0) } ?? []
            done = Dictionary(keys.map { ($0, "") }, uniquingKeysWith: { first, _ in first })
            try? FileManager.default.removeItem(at: legacy)
        }
        doneHashes = done
        return done ?? [:]
    }

    private func keychain(_ name: String) -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: "io.frappe.photos.backup",
            kSecAttrAccount as String: name,
            kSecReturnData as String: true,
        ]
        var result: AnyObject?
        guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess, let data = result as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    private func setKeychain(_ name: String, _ value: String?) {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: "io.frappe.photos.backup",
            kSecAttrAccount as String: name,
        ]
        SecItemDelete(query as CFDictionary)
        guard let value = value, !value.isEmpty else { return }
        var item = query
        item[kSecValueData as String] = Data(value.utf8)
        item[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        SecItemAdd(item as CFDictionary, nil)
    }
}
