import Foundation
import Security

final class BackupStore {
    static let shared = BackupStore()

    private let defaults = UserDefaults.standard
    private let lock = NSLock()
    private var doneKeys: Set<String>?

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
        if site != self.site || user != self.user { clearDone() }
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
        clearDone()
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
        return loadDone().contains(key)
    }

    func markDone(_ key: String) {
        lock.lock()
        defer { lock.unlock() }
        var keys = loadDone()
        keys.insert(key)
        doneKeys = keys
        try? JSONEncoder().encode(Array(keys)).write(to: doneFile, options: .atomic)
    }

    func clearDone() {
        lock.lock()
        defer { lock.unlock() }
        doneKeys = []
        try? FileManager.default.removeItem(at: doneFile)
    }

    private var doneFile: URL {
        let folder = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        try? FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        return folder.appendingPathComponent("backup-done.json")
    }

    private func loadDone() -> Set<String> {
        if let keys = doneKeys { return keys }
        let keys = (try? Data(contentsOf: doneFile)).flatMap { try? JSONDecoder().decode([String].self, from: $0) } ?? []
        doneKeys = Set(keys)
        return doneKeys!
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
