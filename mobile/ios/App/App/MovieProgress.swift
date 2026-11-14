import ActivityKit
import Foundation
import UserNotifications

final class MovieProgress {
    static let shared = MovieProgress()
    static let notificationPrefix = "photos-movie-"

    private var started = Set<String>()
    private var finished = Set<String>()
    private var pending: Any?

    func handle(id: String, title: String, done: Int, total: Int, left: Double?, state: String) {
        if state == "running", !started.contains(id) {
            started.insert(id)
            UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound]) { _, _ in }
        }
        if #available(iOS 16.2, *) {
            updateActivity(id: id, title: title, content: .init(done: done, total: total, left: left, state: state))
        }
        if state != "running", !finished.contains(id) {
            finished.insert(id)
            notify(id: id, title: title, ready: state == "ready")
        }
    }

    @available(iOS 16.2, *)
    private func updateActivity(id: String, title: String, content state: MovieActivityAttributes.ContentState) {
        let existing = Activity<MovieActivityAttributes>.activities.first { $0.attributes.id == id }
        let content = ActivityContent(state: state, staleDate: nil)
        if existing == nil {
            guard state.state == "running", ActivityAuthorizationInfo().areActivitiesEnabled else { return }
            _ = try? Activity.request(attributes: MovieActivityAttributes(id: id, title: title), content: content, pushType: nil)
            return
        }
        guard let activity = existing else { return }
        let previous = pending as? Task<Void, Never>
        pending = Task {
            await previous?.value
            if state.state == "running" {
                await activity.update(content)
            } else {
                await activity.end(content, dismissalPolicy: .after(Date().addingTimeInterval(8)))
            }
        }
    }

    private func notify(id: String, title: String, ready: Bool) {
        let content = UNMutableNotificationContent()
        content.title = ready ? "“\(title)” is ready" : "Couldn't make “\(title)”"
        content.sound = .default
        let request = UNNotificationRequest(identifier: Self.notificationPrefix + id, content: content, trigger: nil)
        UNUserNotificationCenter.current().add(request)
    }
}
