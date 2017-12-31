/*!
 * Pomelo -- commandLine Client
 * Copyright(c) 2015 fantasyni <fantasyni@163.com>
 * MIT Licensed
 */

import protocol = require("../util/protocol");
import utils = require("../util/utils");
import { watch } from "fs";
import { MqttClient } from "../protocol/mqtt/mqttClient";

export class AdminClient {
	static readonly ST_INITED = 1;
	static readonly ST_CONNECTED = 2;
	static readonly ST_REGISTERED = 3;
	static readonly ST_CLOSED = 4;
	private id: string;
	private reqId: number;
	private callbacks: { [idx: string]: Function };
	private listeners: { [idx: string]: Function[] };
	private state = AdminClient.ST_INITED;
	private socket: MqttClient;
	private username: string;
	private password: string;
	private md5: boolean;
	constructor(opt: any) {
		this.id = "";
		this.reqId = 1;
		this.callbacks = {};
		this.listeners = {};
		this.state = AdminClient.ST_INITED;
		this.socket = <any>null;
		opt = opt || {};
		this.username = opt["username"] || "";
		this.password = opt["password"] || "";
		this.md5 = opt["md5"] || false;
	}

	connect(id: string, host: string, port: number, cb: Function) {
		this.id = id;

		console.log("try to connect " + host + ":" + port);
		this.socket = new MqttClient({
			id: id
		});

		this.socket.connect(host, port);

		// this.socket = io.connect('http://' + host + ':' + port, {
		// 	'force new connection': true,
		// 	'reconnect': false
		// });

		this.socket.on("connect", () => {
			this.state = AdminClient.ST_CONNECTED;
			if (this.md5) {
				this.password = utils.md5(this.password);
			}
			this.doSend("register", {
				type: "client",
				id: id,
				username: this.username,
				password: this.password,
				md5: this.md5
			});
		});

		this.socket.on("register", res => {
			if (res.code !== protocol.PRO_OK) {
				cb(res.msg);
				return;
			}

			this.state = AdminClient.ST_REGISTERED;
			cb();
		});

		this.socket.on("client", msg => {
			msg = protocol.parse(msg);
			if (msg.respId) {
				// response for request
				let cb = this.callbacks[msg.respId];
				delete this.callbacks[msg.respId];
				if (cb && typeof cb === "function") {
					cb(msg.error, msg.body);
				}
			} else if (msg.moduleId) {
				// notify
				this.emit(msg.moduleId, msg);
			}
		});

		this.socket.on("error", err => {
			if (this.state < AdminClient.ST_CONNECTED) {
				cb(err);
			}

			this.emit("error", err);
		});

		this.socket.on("disconnect", reason => {
			this.state = AdminClient.ST_CLOSED;
			this.emit("close");
		});
	}

	request(moduleId: string, msg: any, cb: Function) {
		let id = this.reqId++;
		// something dirty: attach current client id into msg
		msg = msg || {};
		msg.clientId = this.id;
		msg.username = this.username;
		let req = protocol.composeRequest(id, moduleId, msg);
		this.callbacks[id] = cb;
		this.doSend("client", req);
		// this.socket.emit('client', req);
	}

	notify(moduleId: string, msg: any) {
		// something dirty: attach current client id into msg
		msg = msg || {};
		msg.clientId = this.id;
		msg.username = this.username;
		let req = protocol.composeRequest(null!, moduleId, msg);
		this.doSend("client", req);
		// this.socket.emit('client', req);
	}

	command(command: string, moduleId: string, msg: any, cb: Function) {
		let id = this.reqId++;
		msg = msg || {};
		msg.clientId = this.id;
		msg.username = this.username;
		let commandReq = protocol.composeCommand(id, command, moduleId, msg);
		this.callbacks[id] = cb;
		this.doSend("client", commandReq);
		// this.socket.emit('client', commandReq);
	}

	doSend(topic: string, msg: any) {
		this.socket.send(topic, msg);
	}

	on(event: string, listener: Function) {
		this.listeners[event] = this.listeners[event] || [];
		this.listeners[event].push(listener);
	}

	emit(event: string, ...other: any[]) {
		let listeners = this.listeners[event];
		if (!listeners || !listeners.length) {
			return;
		}

		let args = Array.prototype.slice.call(arguments, 1);
		let listener;
		for (let i = 0, l = listeners.length; i < l; i++) {
			listener = listeners[i];
			if (typeof listener === "function") {
				listener.apply(null, args);
			}
		}
	}
}
