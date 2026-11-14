import ActivityKit
import Foundation

@available(iOS 16.1, *)
struct MovieActivityAttributes: ActivityAttributes {
    struct ContentState: Codable, Hashable {
        var done: Int
        var total: Int
        var left: Double?
        var state: String
    }

    var id: String
    var title: String
}

enum MovieProgressText {
    static func timeLeft(_ left: Double?) -> String? {
        guard let left = left else { return nil }
        if left >= 90 { return "About \(Int((left / 60).rounded())) min left" }
        return "Less than a minute left"
    }

    static func detail(done: Int, total: Int, left: Double?) -> String {
        let photos = "\(done) of \(total) photos"
        if total > 0 && done >= total { return "\(photos) · Finishing…" }
        guard let time = timeLeft(left) else { return photos }
        return "\(photos) · \(time)"
    }
}
