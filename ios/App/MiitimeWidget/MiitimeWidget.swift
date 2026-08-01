import WidgetKit
import SwiftUI

struct ProjectEntry: TimelineEntry {
    let date: Date
    let project: ProjectSnapshot
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
        switch family {
        case .systemSmall:
            SmallProjectView(project: entry.project)
        case .systemLarge:
            LargeProjectView(project: entry.project)
        default:
            MediumProjectView(project: entry.project)
        }
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

            Text("\(project.rowsCompleted)/\(project.totalRows) rows")
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

                Text("\(project.rowsCompleted) / \(project.totalRows) rows · \(project.progress)% complete")
                    .font(.system(size: 11))
                    .foregroundStyle(.secondary)
            }
        }
        .padding(14)
        .widgetBackground(Color(uiColor: .systemBackground))
    }
}

/// The ASCII "██████░░░░ 52%" block-bar look from the design sketch, rendered
/// as ten discrete segments rather than a continuous capsule — reads more
/// like a stitch/row counter than a generic loading bar.
private struct SegmentedProgressBar: View {
    let progress: Int
    private let segmentCount = 10

    var body: some View {
        let filled = Int((Double(progress) / 100 * Double(segmentCount)).rounded())
        HStack(spacing: 3) {
            ForEach(0..<segmentCount, id: \.self) { index in
                RoundedRectangle(cornerRadius: 2.5)
                    .fill(index < filled ? AnyShapeStyle(miiBrandGradient) : AnyShapeStyle(miiBlue.opacity(0.16)))
                    .frame(height: 12)
            }
        }
    }
}

private struct LargeProjectView: View {
    let project: ProjectSnapshot

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("CONTINUE MAKING")
                .font(.system(size: 11, weight: .bold))
                .foregroundStyle(miiGold)
                .kerning(0.5)

            Text(project.title)
                .font(.system(size: 24, weight: .bold))
                .lineLimit(2)
                .foregroundStyle(.primary)

            VStack(alignment: .leading, spacing: 6) {
                HStack {
                    SegmentedProgressBar(progress: project.progress)
                    Text("\(project.progress)%")
                        .font(.system(size: 15, weight: .bold))
                        .foregroundStyle(miiBlue)
                }
                Text("\(project.rowsCompleted) / \(project.totalRows) rows")
                    .font(.system(size: 12))
                    .foregroundStyle(.secondary)
            }

            if let label = project.nextRoundLabel {
                Divider()

                VStack(alignment: .leading, spacing: 4) {
                    Text("NEXT")
                        .font(.system(size: 10, weight: .bold))
                        .foregroundStyle(.secondary)
                        .kerning(0.4)
                    Text(label)
                        .font(.system(size: 17, weight: .semibold))
                        .foregroundStyle(.primary)
                    if let hint = project.nextRoundHint, !hint.isEmpty {
                        Text(hint)
                            .font(.system(size: 13))
                            .foregroundStyle(.secondary)
                            .lineLimit(3)
                    }
                }
            }

            Spacer(minLength: 0)
        }
        .padding(16)
        .widgetBackground(Color(uiColor: .systemBackground))
    }
}

struct MiitimeWidget: Widget {
    let kind: String = "MiitimeWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: ProjectProvider()) { entry in
            MiitimeWidgetEntryView(entry: entry)
        }
        .configurationDisplayName("Current Project")
        .description("Track your active knit or crochet project's progress.")
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
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

@available(iOSApplicationExtension 17.0, *)
#Preview(as: .systemLarge) {
    MiitimeWidget()
} timeline: {
    ProjectEntry(date: .now, project: .placeholder)
}
