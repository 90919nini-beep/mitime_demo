import WidgetKit
import SwiftUI

struct FinishedProjectsEntry: TimelineEntry {
    let date: Date
    let manifest: FinishedProjectsManifest
    let thumbnails: [String: UIImage] // keyed by FinishedProjectItem.filename
}

struct FinishedProjectsProvider: TimelineProvider {
    func placeholder(in context: Context) -> FinishedProjectsEntry {
        FinishedProjectsEntry(date: Date(), manifest: .placeholder, thumbnails: [:])
    }

    func getSnapshot(in context: Context, completion: @escaping (FinishedProjectsEntry) -> Void) {
        completion(makeEntry())
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<FinishedProjectsEntry>) -> Void) {
        // Refreshed on demand — WidgetSyncPlugin calls WidgetCenter.reloadTimelines
        // whenever the app writes a new manifest.
        completion(Timeline(entries: [makeEntry()], policy: .never))
    }

    private func makeEntry() -> FinishedProjectsEntry {
        let manifest = FinishedProjectsManifest.loadCurrent()
        var thumbnails: [String: UIImage] = [:]
        if let dir = WidgetAppGroup.thumbsDirectoryURL {
            for item in manifest.items {
                if let image = UIImage(contentsOfFile: dir.appendingPathComponent(item.filename).path) {
                    thumbnails[item.filename] = image
                }
            }
        }
        return FinishedProjectsEntry(date: Date(), manifest: manifest, thumbnails: thumbnails)
    }
}

private extension FinishedProjectsManifest {
    static let placeholder = FinishedProjectsManifest(
        items: [
            FinishedProjectItem(id: "p1", title: "Chunky Cable Sweater", filename: "placeholder-1"),
            FinishedProjectItem(id: "p2", title: "Market Tote Bag", filename: "placeholder-2"),
            FinishedProjectItem(id: "p3", title: "Autumn Harvest Shawl", filename: "placeholder-3"),
        ],
        totalCount: 5
    )
}

struct FinishedProjectsWidgetEntryView: View {
    @Environment(\.widgetFamily) var family
    var entry: FinishedProjectsProvider.Entry

    var body: some View {
        if entry.manifest.items.isEmpty {
            EmptyFinishedView()
        } else {
            switch family {
            case .systemSmall:
                SmallFinishedView(entry: entry)
            default:
                MediumFinishedView(entry: entry)
            }
        }
    }
}

private struct EmptyFinishedView: View {
    var body: some View {
        VStack(spacing: 6) {
            Image(systemName: "sparkles")
                .font(.system(size: 20))
                .foregroundStyle(miiGold)
            Text("No finished projects yet")
                .font(.system(size: 12, weight: .semibold))
                .multilineTextAlignment(.center)
                .foregroundStyle(.primary)
            Text("Complete a project and add a photo!")
                .font(.system(size: 10))
                .multilineTextAlignment(.center)
                .foregroundStyle(.secondary)
        }
        .padding(14)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .widgetBackground(Color(uiColor: .systemBackground))
    }
}

/// A single finished-project sticker: the cutout photo keeps its own contour
/// (no crop/mask) since that's the whole point of the sticker treatment on
/// the Dashboard — a plain square crop would hide the die-cut white edge.
private struct StickerTile: View {
    let entry: FinishedProjectsProvider.Entry
    let item: FinishedProjectItem?
    let size: CGFloat

    var body: some View {
        Group {
            if let item, let uiImage = entry.thumbnails[item.filename] {
                Image(uiImage: uiImage)
                    .resizable()
                    .scaledToFit()
                    .shadow(color: .black.opacity(0.18), radius: 3, y: 2)
            } else {
                RoundedRectangle(cornerRadius: size * 0.22)
                    .fill(miiBlue.opacity(0.14))
                    .overlay(
                        Image(systemName: "star.fill")
                            .font(.system(size: size * 0.32))
                            .foregroundStyle(miiGold)
                    )
            }
        }
        .frame(width: size, height: size)
    }
}

private struct SmallFinishedView: View {
    let entry: FinishedProjectsProvider.Entry

    var body: some View {
        let latest = entry.manifest.items.first

        VStack(spacing: 6) {
            Text("FINISHED PROJECTS")
                .font(.system(size: 9, weight: .bold))
                .foregroundStyle(miiGold)
                .kerning(0.4)
                .lineLimit(1)

            Spacer(minLength: 0)

            StickerTile(entry: entry, item: latest, size: 72)

            Spacer(minLength: 0)

            Text(latest?.title ?? "")
                .font(.system(size: 12, weight: .semibold))
                .lineLimit(1)
                .foregroundStyle(.primary)

            Text("\(entry.manifest.totalCount) \(entry.manifest.totalCount == 1 ? "project" : "projects")")
                .font(.system(size: 10))
                .foregroundStyle(.secondary)
        }
        .padding(12)
        .widgetBackground(Color(uiColor: .systemBackground))
    }
}

private struct MediumFinishedView: View {
    let entry: FinishedProjectsProvider.Entry

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text("FINISHED PROJECTS")
                        .font(.system(size: 10, weight: .bold))
                        .foregroundStyle(miiGold)
                        .kerning(0.4)
                    Text("\(entry.manifest.totalCount) \(entry.manifest.totalCount == 1 ? "project" : "projects")")
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(.primary)
                }
                Spacer(minLength: 0)
            }

            Spacer(minLength: 0)

            HStack(spacing: 10) {
                ForEach(0..<4, id: \.self) { index in
                    let item = index < entry.manifest.items.count ? entry.manifest.items[index] : nil
                    StickerTile(entry: entry, item: item, size: 56)
                        .frame(maxWidth: .infinity)
                        .opacity(item == nil ? 0.35 : 1)
                }
            }
        }
        .padding(14)
        .widgetBackground(Color(uiColor: .systemBackground))
    }
}

struct FinishedProjectsWidget: Widget {
    let kind: String = "FinishedProjectsWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: FinishedProjectsProvider()) { entry in
            FinishedProjectsWidgetEntryView(entry: entry)
        }
        .configurationDisplayName("Finished Projects")
        .description("A peek at your completed knit and crochet makes.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

@available(iOSApplicationExtension 17.0, *)
#Preview(as: .systemSmall) {
    FinishedProjectsWidget()
} timeline: {
    FinishedProjectsEntry(date: .now, manifest: .placeholder, thumbnails: [:])
}

@available(iOSApplicationExtension 17.0, *)
#Preview(as: .systemMedium) {
    FinishedProjectsWidget()
} timeline: {
    FinishedProjectsEntry(date: .now, manifest: .placeholder, thumbnails: [:])
}
