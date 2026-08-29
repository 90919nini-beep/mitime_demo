import Foundation
import EventKit
import Capacitor

/// Direct calendar-add for the party "Add to Calendar" flow — creates a real
/// EKEvent via EventKit, as opposed to addPartyToCalendar()'s .ics + Share
/// Sheet flow in index.html, which stays untouched for whatever else uses it.
///
/// Access is requested inside addEvent() only, never at launch or anywhere
/// else — so this plugin can never be the thing that triggers a Calendar
/// permission prompt except in direct response to the JS side calling
/// addEvent(), which itself only happens on an explicit "Add to Calendar" tap.
@objc(CalendarPlugin)
public class CalendarPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "CalendarPlugin"
    public let jsName = "Calendar"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "addEvent", returnType: CAPPluginReturnPromise)
    ]

    private let store = EKEventStore()

    @objc func addEvent(_ call: CAPPluginCall) {
        guard let title = call.getString("title") else {
            call.reject("Missing 'title'")
            return
        }
        guard let startMillis = call.getDouble("start") else {
            call.reject("Missing 'start'")
            return
        }
        let endMillis = call.getDouble("end") ?? (startMillis + 2 * 60 * 60 * 1000)
        let location = call.getString("location")
        let notes = call.getString("notes")

        requestAccess { [weak self] granted, error in
            guard let self = self else { return }
            guard granted else {
                call.reject(error?.localizedDescription ?? "Calendar access was not granted")
                return
            }
            DispatchQueue.main.async {
                let event = EKEvent(eventStore: self.store)
                event.title = title
                event.startDate = Date(timeIntervalSince1970: startMillis / 1000)
                event.endDate = Date(timeIntervalSince1970: endMillis / 1000)
                if let location = location, !location.isEmpty { event.location = location }
                if let notes = notes, !notes.isEmpty { event.notes = notes }
                event.calendar = self.store.defaultCalendarForNewEvents ?? self.store.calendars(for: .event).first

                guard event.calendar != nil else {
                    call.reject("No writable calendar available on this device")
                    return
                }
                do {
                    try self.store.save(event, span: .thisEvent)
                    call.resolve(["ok": true, "eventId": event.eventIdentifier ?? ""])
                } catch {
                    call.reject("Failed to save event: \(error.localizedDescription)")
                }
            }
        }
    }

    /// iOS 17 split calendar access into full/write-only; requestFullAccessToEvents
    /// is the correct call there, requestAccess(to:) is what every earlier iOS
    /// version has. Both funnel into the same granted/error callback shape.
    private func requestAccess(_ completion: @escaping (Bool, Error?) -> Void) {
        if #available(iOS 17.0, *) {
            store.requestFullAccessToEvents { granted, error in completion(granted, error) }
        } else {
            store.requestAccess(to: .event) { granted, error in completion(granted, error) }
        }
    }
}
