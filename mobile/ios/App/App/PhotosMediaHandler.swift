import Foundation
import UniformTypeIdentifiers
import WebKit

final class PhotosMediaHandler: NSObject, WKURLSchemeHandler {
    static let shared = PhotosMediaHandler()
    var origin = ""
    var token = ""

    private static let block = 1 << 20
    private static let ahead = 4
    private static let keepBlocks = 32
    private static let keepFiles = 2

    private let net = DispatchQueue(label: "photos.media.net", qos: .userInitiated)
    private lazy var session: URLSession = {
        let queue = OperationQueue()
        queue.maxConcurrentOperationCount = 1
        queue.underlyingQueue = net
        let configuration = URLSessionConfiguration.default
        configuration.urlCache = nil
        return URLSession(configuration: configuration, delegate: nil, delegateQueue: queue)
    }()
    private let disk = DispatchQueue(label: "photos.media.disk")
    private var folder: URL { FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0].appendingPathComponent("media") }

    private final class Delivery {
        let scheme: WKURLSchemeTask
        var stopped = false
        init(scheme: WKURLSchemeTask) { self.scheme = scheme }
    }
    private var live: [ObjectIdentifier: Delivery] = [:]

    private final class File {
        let src: URL
        let target: URL
        var total: Int?
        var type = "application/octet-stream"
        var blocks: [Int: Data] = [:]
        var used: [Int] = []
        var waiting: [Int: [(Data?) -> Void]] = [:]
        init(src: URL, target: URL) { self.src = src; self.target = target }
    }
    private var files: [File] = []

    func webView(_ webView: WKWebView, start schemeTask: WKURLSchemeTask) {
        guard let url = schemeTask.request.url, let host = url.host,
              let src = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems?.first(where: { $0.name == "src" })?.value,
              !origin.isEmpty, src.hasPrefix(origin + "/"), let srcURL = URL(string: src) else {
            return fail(schemeTask, status: 403)
        }
        if schemeTask.request.mainDocumentURL == url { return fail(schemeTask, status: 403) }
        let target = folder.appendingPathComponent(host).appendingPathComponent(url.lastPathComponent)
        let range = schemeTask.request.value(forHTTPHeaderField: "Range")
        if FileManager.default.fileExists(atPath: target.path) { return fromDisk(schemeTask, file: target, range: range) }
        let delivery = Delivery(scheme: schemeTask)
        live[ObjectIdentifier(schemeTask)] = delivery
        let bearer = token
        net.async { self.serve(delivery, file: self.file(src: srcURL, target: target), range: range, bearer: bearer) }
    }

    func webView(_ webView: WKWebView, stop schemeTask: WKURLSchemeTask) {
        live.removeValue(forKey: ObjectIdentifier(schemeTask))?.stopped = true
    }

    func clear() {
        net.async { self.files.removeAll() }
    }

    private func file(src: URL, target: URL) -> File {
        if let known = files.first(where: { $0.target == target }) { return known }
        let file = File(src: src, target: target)
        files.append(file)
        if files.count > Self.keepFiles { files.removeFirst() }
        return file
    }

    private func serve(_ delivery: Delivery, file: File, range: String?, bearer: String) {
        let asked = Self.parse(range)
        let opening = (asked?.first ?? 0) / Self.block
        fetch(file, index: opening, bearer: bearer) { block in
            guard block != nil, let total = file.total else { return self.fail(delivery, status: 502) }
            guard let (start, end) = Self.bounds(asked, total: total) else { return self.fail(delivery, status: 416) }
            var headers = ["Content-Type": file.type, "Accept-Ranges": "bytes", "Content-Length": String(end - start + 1), "X-Content-Type-Options": "nosniff"]
            if range != nil { headers["Content-Range"] = "bytes \(start)-\(end)/\(total)" }
            self.begin(delivery, status: range == nil ? 200 : 206, headers: headers)
            self.stream(delivery, file: file, from: start, to: end, bearer: bearer)
        }
    }

    private func stream(_ delivery: Delivery, file: File, from position: Int, to end: Int, bearer: String) {
        let index = position / Self.block
        defer { readAhead(file, after: index, bearer: bearer) }
        fetch(file, index: index, bearer: bearer) { block in
            let offset = position - index * Self.block
            guard let block = block, block.count > offset else { return self.abort(delivery) }
            let take = min(block.count - offset, end - position + 1)
            let from = block.startIndex + offset
            let next = position + take
            self.send(delivery, block[from..<(from + take)], last: next > end) {
                self.net.async { self.stream(delivery, file: file, from: next, to: end, bearer: bearer) }
            }
        }
    }

    private func fetch(_ file: File, index: Int, bearer: String, done: @escaping (Data?) -> Void) {
        if let block = file.blocks[index] {
            touch(file, index)
            return done(block)
        }
        if let total = file.total, index * Self.block >= total { return done(nil) }
        if file.waiting[index] != nil {
            file.waiting[index]?.append(done)
            return
        }
        file.waiting[index] = [done]
        var request = URLRequest(url: file.src)
        request.setValue("Bearer \(bearer)", forHTTPHeaderField: "Authorization")
        let from = index * Self.block
        request.setValue("bytes=\(from)-\(from + Self.block - 1)", forHTTPHeaderField: "Range")
        session.dataTask(with: request) { data, response, _ in
            let waiters = file.waiting.removeValue(forKey: index) ?? []
            guard let http = response as? HTTPURLResponse, let data = data, http.statusCode == 200 || http.statusCode == 206 else {
                return waiters.forEach { $0(nil) }
            }
            if let type = http.value(forHTTPHeaderField: "Content-Type") { file.type = self.inert(type) }
            if http.statusCode == 200 {
                file.total = data.count
                var offset = 0
                while offset < data.count {
                    let upper = min(offset + Self.block, data.count)
                    file.blocks[offset / Self.block] = data.subdata(in: offset..<upper)
                    offset = upper
                }
            } else {
                if file.total == nil, let range = http.value(forHTTPHeaderField: "Content-Range"),
                   let size = range.split(separator: "/").last.flatMap({ Int($0) }) {
                    file.total = size
                }
                file.blocks[index] = data
            }
            let block = file.blocks[index]
            self.touch(file, index)
            self.keepIfWhole(file)
            waiters.forEach { $0(block) }
        }.resume()
    }

    private func readAhead(_ file: File, after index: Int, bearer: String) {
        guard let total = file.total else { return }
        for next in (index + 1)...(index + Self.ahead) where next * Self.block < total {
            if file.blocks[next] == nil, file.waiting[next] == nil {
                fetch(file, index: next, bearer: bearer) { _ in }
            }
        }
    }

    private func touch(_ file: File, _ index: Int) {
        file.used.removeAll { $0 == index }
        file.used.append(index)
        while file.used.count > Self.keepBlocks {
            file.blocks.removeValue(forKey: file.used.removeFirst())
        }
    }

    private func keepIfWhole(_ file: File) {
        guard let total = file.total else { return }
        let count = (total + Self.block - 1) / Self.block
        guard file.blocks.count == count else { return }
        let parts = (0..<count).compactMap { file.blocks[$0] }
        guard parts.count == count else { return }
        let target = file.target
        disk.async {
            try? FileManager.default.createDirectory(at: target.deletingLastPathComponent(), withIntermediateDirectories: true)
            let part = target.appendingPathExtension("part")
            guard FileManager.default.createFile(atPath: part.path, contents: nil),
                  let handle = try? FileHandle(forWritingTo: part) else { return }
            parts.forEach { handle.write($0) }
            try? handle.close()
            try? FileManager.default.removeItem(at: target)
            try? FileManager.default.moveItem(at: part, to: target)
        }
    }

    private struct Asked { let first: Int?; let last: Int?; let suffix: Int? }

    private static func parse(_ range: String?) -> Asked? {
        guard let range = range, range.hasPrefix("bytes=") else { return nil }
        let parts = range.dropFirst(6).split(separator: "-", omittingEmptySubsequences: false).map { Int($0) }
        guard parts.count == 2 else { return nil }
        if let first = parts[0] { return Asked(first: first, last: parts[1], suffix: nil) }
        return Asked(first: nil, last: nil, suffix: parts[1])
    }

    private static func bounds(_ asked: Asked?, total: Int) -> (Int, Int)? {
        guard total > 0 else { return nil }
        guard let asked = asked else { return (0, total - 1) }
        if let suffix = asked.suffix { return (max(0, total - suffix), total - 1) }
        guard let first = asked.first, first < total else { return nil }
        return (first, min(asked.last ?? total - 1, total - 1))
    }

    private func begin(_ delivery: Delivery, status: Int, headers: [String: String]) {
        DispatchQueue.main.async {
            guard !delivery.stopped else { return }
            let task = delivery.scheme
            task.didReceive(HTTPURLResponse(url: task.request.url!, statusCode: status, httpVersion: "HTTP/1.1", headerFields: headers)!)
        }
    }

    private func send(_ delivery: Delivery, _ piece: Data, last: Bool, more: @escaping () -> Void) {
        DispatchQueue.main.async {
            guard !delivery.stopped else { return }
            delivery.scheme.didReceive(piece)
            guard last else { return more() }
            self.live.removeValue(forKey: ObjectIdentifier(delivery.scheme))
            delivery.scheme.didFinish()
        }
    }

    private func abort(_ delivery: Delivery) {
        DispatchQueue.main.async {
            guard !delivery.stopped else { return }
            self.live.removeValue(forKey: ObjectIdentifier(delivery.scheme))
            delivery.scheme.didFailWithError(URLError(.networkConnectionLost))
        }
    }

    private func fail(_ delivery: Delivery, status: Int) {
        DispatchQueue.main.async {
            guard !delivery.stopped else { return }
            self.live.removeValue(forKey: ObjectIdentifier(delivery.scheme))
            self.fail(delivery.scheme, status: status)
        }
    }

    private func fromDisk(_ schemeTask: WKURLSchemeTask, file: URL, range: String?) {
        guard let data = try? Data(contentsOf: file, options: .mappedIfSafe) else { return fail(schemeTask, status: 500) }
        guard let (start, end) = Self.bounds(Self.parse(range), total: data.count) else { return fail(schemeTask, status: 416) }
        var headers = ["Content-Type": mime(for: file), "Accept-Ranges": "bytes", "Content-Length": String(end - start + 1), "X-Content-Type-Options": "nosniff"]
        if range != nil { headers["Content-Range"] = "bytes \(start)-\(end)/\(data.count)" }
        let response = HTTPURLResponse(url: schemeTask.request.url!, statusCode: range == nil ? 200 : 206, httpVersion: "HTTP/1.1", headerFields: headers)!
        schemeTask.didReceive(response)
        let slice = 1 << 20
        var offset = start
        while offset <= end {
            let upper = min(offset + slice, end + 1)
            schemeTask.didReceive(offset == 0 && upper == data.count ? data : data.subdata(in: offset..<upper))
            offset = upper
        }
        schemeTask.didFinish()
    }

    private func fail(_ schemeTask: WKURLSchemeTask, status: Int) {
        schemeTask.didReceive(HTTPURLResponse(url: schemeTask.request.url!, statusCode: status, httpVersion: "HTTP/1.1", headerFields: [:])!)
        schemeTask.didFinish()
    }

    private func mime(for file: URL) -> String {
        inert(UTType(filenameExtension: file.pathExtension)?.preferredMIMEType ?? "application/octet-stream")
    }

    private func inert(_ contentType: String) -> String {
        let type = contentType.lowercased()
        return type.hasPrefix("text/html") || type.hasPrefix("application/xhtml+xml") ? "text/plain" : contentType
    }
}
