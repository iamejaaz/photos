import Foundation
import Capacitor
import SocketIO

@objc(PhotosSocketPlugin)
public class PhotosSocketPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "PhotosSocketPlugin"
    public let jsName = "PhotosSocket"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "connect", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "disconnect", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "emit", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setToken", returnType: CAPPluginReturnPromise),
    ]

    private var manager: SocketManager?
    private var socket: SocketIOClient?
    private var origin = ""
    private var siteName = ""
    private var hasConnected = false
    private var connectedTarget = ""

    @objc func connect(_ call: CAPPluginCall) {
        guard let urlString = call.getString("url"), let url = URL(string: urlString) else {
            call.reject("url required")
            return
        }
        let target = urlString + "/" + (call.getString("namespace") ?? "") + "@" + (call.getString("origin") ?? "")
        if let socket = socket, target == connectedTarget {
            manager?.setConfigs(options(call.getString("token") ?? ""))
            if socket.status == .connected { notifyListeners("connect", data: [:]) }
            else { manager?.disconnect(); socket.connect() }
            call.resolve()
            return
        }
        close()
        connectedTarget = target
        hasConnected = false
        origin = call.getString("origin") ?? ""
        siteName = call.getString("namespace") ?? ""
        let manager = SocketManager(socketURL: url, config: options(call.getString("token") ?? ""))
        let socket = manager.socket(forNamespace: "/" + siteName)
        socket.on(clientEvent: .connect) { [weak self] _, _ in
            guard let self = self else { return }
            self.notifyListeners("connect", data: [:])
            if self.hasConnected { self.notifyListeners("reconnect", data: [:]) }
            self.hasConnected = true
        }
        socket.on(clientEvent: .disconnect) { [weak self] data, _ in self?.notifyListeners("disconnect", data: ["reason": "\(data.first ?? "")"]) }
        socket.on(clientEvent: .error) { [weak self] data, _ in
            CAPLog.print("PhotosSocket: connect error: \(data)")
            self?.notifyListeners("connect_error", data: ["message": "\(data)"])
        }
        socket.onAny { [weak self] event in
            if SocketClientEvent(rawValue: event.event) != nil { return }
            self?.notifyListeners("event", data: ["event": event.event, "args": event.items ?? []])
        }
        self.manager = manager
        self.socket = socket
        socket.connect()
        call.resolve()
    }

    @objc func disconnect(_ call: CAPPluginCall) {
        close()
        call.resolve()
    }

    @objc func emit(_ call: CAPPluginCall) {
        if let socket = socket, let event = call.getString("event") {
            let items = (call.getArray("args") ?? []).compactMap { $0 as? SocketData }
            socket.emit(event, with: items, completion: nil)
        }
        call.resolve()
    }

    @objc func setToken(_ call: CAPPluginCall) {
        manager?.setConfigs(options(call.getString("token") ?? ""))
        call.resolve()
    }

    private func options(_ token: String) -> SocketIOClientConfiguration {
        [.log(false), .forceWebsockets(true), .forceNew(true), .reconnectWait(1), .reconnectWaitMax(5), .extraHeaders(headers(token))]
    }

    private func headers(_ token: String) -> [String: String] {
        ["Origin": origin, "Authorization": "Bearer \(token)", "X-Frappe-Site-Name": siteName]
    }

    private func close() {
        connectedTarget = ""
        socket?.removeAllHandlers()
        manager?.disconnect()
        socket = nil
        manager = nil
    }
}
