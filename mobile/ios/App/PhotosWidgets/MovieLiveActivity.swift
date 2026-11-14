import ActivityKit
import SwiftUI
import WidgetKit

struct MovieLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: MovieActivityAttributes.self) { context in
            MovieLockScreenView(title: context.attributes.title, state: context.state)
                .padding(16)
                .activityBackgroundTint(nil)
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    MovieIcon(state: context.state.state)
                        .font(.title2)
                        .padding(.leading, 4)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    if context.state.state == "running" {
                        Text(percent(context.state))
                            .font(.headline)
                            .monospacedDigit()
                            .padding(.trailing, 4)
                    }
                }
                DynamicIslandExpandedRegion(.center) {
                    Text(heading(context.attributes.title, context.state.state))
                        .font(.headline)
                        .lineLimit(1)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    if context.state.state == "running" {
                        VStack(alignment: .leading, spacing: 6) {
                            ProgressView(value: fraction(context.state))
                                .tint(.accentColor)
                            Text(MovieProgressText.detail(done: context.state.done, total: context.state.total, left: context.state.left))
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                }
            } compactLeading: {
                MovieIcon(state: context.state.state)
            } compactTrailing: {
                if context.state.state == "running" {
                    Text(percent(context.state))
                        .monospacedDigit()
                } else {
                    MovieIcon(state: context.state.state)
                }
            } minimal: {
                if context.state.state == "running" {
                    ProgressView(value: fraction(context.state)) {
                        Image(systemName: "film")
                    }
                    .progressViewStyle(.circular)
                } else {
                    MovieIcon(state: context.state.state)
                }
            }
        }
    }
}

private struct MovieLockScreenView: View {
    let title: String
    let state: MovieActivityAttributes.ContentState

    var body: some View {
        HStack(alignment: .center, spacing: 14) {
            MovieIcon(state: state.state)
                .font(.title2)
                .frame(width: 44, height: 44)
                .background(Color.secondary.opacity(0.15), in: RoundedRectangle(cornerRadius: 10))
            VStack(alignment: .leading, spacing: 6) {
                Text(heading(title, state.state))
                    .font(.headline)
                    .foregroundStyle(.primary)
                    .lineLimit(1)
                if state.state == "running" {
                    ProgressView(value: fraction(state))
                        .tint(.accentColor)
                    Text(MovieProgressText.detail(done: state.done, total: state.total, left: state.left))
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
            }
        }
    }
}

private struct MovieIcon: View {
    let state: String

    var body: some View {
        switch state {
        case "ready":
            Image(systemName: "checkmark.circle.fill").foregroundStyle(.green)
        case "failed":
            Image(systemName: "exclamationmark.circle.fill").foregroundStyle(.orange)
        default:
            Image(systemName: "film").foregroundStyle(.primary)
        }
    }
}

private func heading(_ title: String, _ state: String) -> String {
    switch state {
    case "ready": return "“\(title)” is ready"
    case "failed": return "Couldn't make “\(title)”"
    default: return "Making “\(title)”"
    }
}

private func fraction(_ state: MovieActivityAttributes.ContentState) -> Double {
    guard state.total > 0 else { return 0 }
    return min(1, Double(state.done) / Double(state.total))
}

private func percent(_ state: MovieActivityAttributes.ContentState) -> String {
    "\(Int((fraction(state) * 100).rounded()))%"
}
