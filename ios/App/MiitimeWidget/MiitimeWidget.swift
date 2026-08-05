import WidgetKit
import SwiftUI

struct ProjectEntry: TimelineEntry {
    let date: Date
    let project: ProjectSnapshot?
}

struct ProjectProvider: TimelineProvider {
    func placeholder(in context: Context) -> ProjectEntry {
        ProjectEntry(date: Date(), project: .placeholder)
    }

    func getSnapshot(in context: Context, completion: @escaping (ProjectEntry) -> Void) {
        completion(ProjectEntry(date: Date(), project: .loadCurrent()))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<ProjectEntry>) -> Void) {
        let entry = ProjectEntry(date: Date(), project: .loadCurrent())
        // Widget only changes when the app writes new data, so a distant refresh
        // is enough — WidgetCenter.reloadTimelines() from the app drives updates.
        let timeline = Timeline(entries: [entry], policy: .never)
        completion(timeline)
    }
}

struct MiitimeWidgetEntryView: View {
    @Environment(\.widgetFamily) var family
    var entry: ProjectProvider.Entry

    var body: some View {
        if let project = entry.project {
            switch family {
            case .systemSmall:
                SmallProjectView(project: project)
            default:
                MediumProjectView(project: project)
            }
        } else {
            EmptyProjectView()
        }
    }
}

private struct EmptyProjectView: View {
    var body: some View {
        VStack(spacing: 6) {
            Image("MiiLogoMark")
                .resizable()
                .scaledToFit()
                .frame(width: 90, height: 34)
            Text("widget.current.empty.title")
                .font(.system(size: 12, weight: .semibold))
                .multilineTextAlignment(.center)
                .foregroundStyle(.primary)
            Text("widget.current.empty.subtitle")
                .font(.system(size: 10))
                .multilineTextAlignment(.center)
                .foregroundStyle(.secondary)
        }
        .padding(14)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .widgetBackground(Color(uiColor: .systemBackground))
    }
}

private struct SmallProjectView: View {
    let project: ProjectSnapshot

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(project.title)
                .font(.system(size: 14, weight: .semibold))
                .lineLimit(2)
                .foregroundStyle(.primary)

            Spacer(minLength: 0)

            ZStack {
                Circle()
                    .stroke(miiBlue.opacity(0.16), lineWidth: 6)
                Circle()
                    .trim(from: 0, to: CGFloat(project.progress) / 100)
                    .stroke(miiBrandGradient, style: StrokeStyle(lineWidth: 6, lineCap: .round))
                    .rotationEffect(.degrees(-90))
                Text("\(project.progress)%")
                    .font(.system(size: 15, weight: .bold))
                    .foregroundStyle(miiGold)
            }
            .frame(width: 56, height: 56)

            Text(widgetLocalizedRowsShort(project.rowsCompleted, project.totalRows))
                .font(.system(size: 11))
                .foregroundStyle(.secondary)
        }
        .padding(14)
        .widgetBackground(Color(uiColor: .systemBackground))
    }
}

private struct MediumProjectView: View {
    let project: ProjectSnapshot

    var body: some View {
        HStack(spacing: 14) {
            VStack(alignment: .leading, spacing: 6) {
                Text(project.status.uppercased())
                    .font(.system(size: 10, weight: .bold))
                    .foregroundStyle(miiGold)
                    .kerning(0.5)

                Text(project.title)
                    .font(.system(size: 17, weight: .semibold))
                    .lineLimit(2)

                Spacer(minLength: 0)

                GeometryReader { geo in
                    ZStack(alignment: .leading) {
                        Capsule().fill(miiBlue.opacity(0.16))
                        Capsule()
                            .fill(miiBrandGradient)
                            .frame(width: geo.size.width * CGFloat(project.progress) / 100)
                    }
                }
                .frame(height: 8)

                Text(widgetLocalizedRowsLong(project.rowsCompleted, project.totalRows, project.progress))
                    .font(.system(size: 11))
                    .foregroundStyle(.secondary)

                if let label = project.nextRoundLabel {
                    HStack(spacing: 4) {
                        Text("widget.current.next")
                            .font(.system(size: 9, weight: .bold))
                            .foregroundStyle(miiGold)
                            .kerning(0.4)
                        Text(label)
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundStyle(.primary)
                        if let hint = project.nextRoundHint, !hint.isEmpty {
                            Text("· " + hint)
                                .font(.system(size: 11))
                                .foregroundStyle(.secondary)
                                .lineLimit(1)
                        }
                    }
                }
            }
        }
        .padding(14)
        .widgetBackground(Color(uiColor: .systemBackground))
    }
}

struct MiitimeWidget: Widget {
    let kind: String = "MiitimeWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: ProjectProvider()) { entry in
            MiitimeWidgetEntryView(entry: entry)
        }
        .configurationDisplayName("widget.current.displayName")
        .description("widget.current.description")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

@available(iOSApplicationExtension 17.0, *)
#Preview(as: .systemSmall) {
    MiitimeWidget()
} timeline: {
    ProjectEntry(date: .now, project: .placeholder)
}

@available(iOSApplicationExtension 17.0, *)
#Preview(as: .systemMedium) {
    MiitimeWidget()
} timeline: {
    ProjectEntry(date: .now, project: .placeholder)
}
