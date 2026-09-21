import Foundation
import EventKit
import EventKitUI
import Capacitor

/// Direct calendar-add for the party "Add to Calendar" flow — presents the
/// real native iOS Calendar event editor (EKEventEditViewController) so the
/// user reviews/edits the pre-filled event and taps the system's own Add
/// button before anything is saved, as opposed to addPartyToCalendar()'s
/// .ics + Share Sheet flow in index.html, which stays untouched for whatever
/// else uses it. Previously this saved the event directly via
/// EKEventStore.save() with no review step; that direct-save path is gone.
///
/// Access is requested inside addEvent() only, never at launch or anywhere
/// else — so this plugin can never be the thing that triggers a Calendar
/// permission prompt except in direct response to the JS side calling
/// addEvent(), which itself only happens on an explicit "Add to Calendar" tap.
@objc(CalendarPlugin)
public class CalendarPlugin: CAPPlugin, CAPBridgedPlugin, EKEventEditViewDelegate {
    public let identifier = "CalendarPlugin"
    public let jsName = "Calendar"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "addEvent", returnType: CAPPluginReturnPromise)
    ]

    private let store = EKEventStore()

    /// EKEventEditViewController's delegate callback carries no context of
    /// its own, so this is how its result finds its way back to the
    /// CAPPluginCall that triggered it. Only one add-to-calendar flow can be
    /// on screen at a time -- a second call while one is already presented
    /// is rejected rather than silently orphaning the first.
    private var pendingCall: CAPPluginCall?

    @objc func addEvent(_ call: CAPPluginCall) {
        guard let title = call.getString("title") else {
            call.reject("Missing 'title'")
            return
        }
        guard let startMillis = call.getDouble("start") else {
            call.reject("Missing 'start'")
            return
        }
        guard pendingCall == nil else {
            call.reject("An Add to Calendar flow is already in progress")
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
                guard let presenter = self.bridge?.viewController else {
                    call.reject("No view controller available to present the calendar editor")
                    return
                }
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

                self.pendingCall = call
                let editVC = EKEventEditViewController()
                editVC.eventStore = self.store
                editVC.event = event
                editVC.editViewDelegate = self
                presenter.present(editVC, animated: true)
            }
        }
    }

    /// Fired when the user taps the native editor's Add/Cancel button (or,
    /// for an existing event, Delete -- not reachable here since this is
    /// always a new, unsaved event). By the time .saved arrives, iOS has
    /// already written the event to the calendar itself; this only reports
    /// the outcome back to JS, it doesn't do any saving of its own.
    public func eventEditViewController(_ controller: EKEventEditViewController, didCompleteWith action: EKEventEditViewAction) {
        let call = pendingCall
        pendingCall = nil
        controller.dismiss(animated: true) {
            switch action {
            case .saved:
                call?.resolve(["ok": true, "eventId": controller.event?.eventIdentifier ?? ""])
            case .canceled, .deleted:
                // Not an error -- the user reviewed the native editor and chose
                // not to save. JS treats this the same as any other non-add
                // outcome: back to idle, nothing logged as a failure.
                call?.resolve(["ok": false, "canceled": true])
            @unknown default:
                call?.resolve(["ok": false, "canceled": true])
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
