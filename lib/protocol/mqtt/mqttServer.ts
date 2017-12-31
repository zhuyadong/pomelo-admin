const logger = require("pomelo-logger").getLogger("pomelo-admin", "MqttServer");
import MqttCon = require("mqtt-connection");
import Util = require("util");
import net = require("net");
import { EventEmitter } from "events";
import { Socket } from "net";
import { MqttPacket } from "../../../index";

let curId = 1;

export class MqttServer extends EventEmitter {
	private inited: boolean;
	private closed: boolean;
	private server: net.Server;
	private socket: MqttCon;
	constructor(opts?: any, private cb?: Function) {
		super();
		this.inited = false;
		this.closed = true;
	}

	listen(port: number) {
		//check status
		if (this.inited) {
			this.cb!(new Error("already inited."));
			return;
		}

		this.inited = true;

		let self = this;

		this.server = new net.Server();
		this.server.listen(port);

		logger.info("[MqttServer] listen on %d", port);

		this.server.on("listening", this.emit.bind(this, "listening"));

		this.server.on("error", function(err) {
			// logger.error('mqtt server is error: %j', err.stack);
			self.emit("error", err);
		});

		this.server.on("connection", (stream: Socket) => {
			let socket = new MqttCon(stream);
			socket.id = curId++;

			socket.on("connect", (pkg: MqttPacket) => {
				socket.connack({
					returnCode: 0
				});
			});

			socket.on("publish", function(pkg: MqttPacket) {
				let topic = pkg.topic;
				let msg = pkg.payload.toString();
				msg = JSON.parse(msg);

				// logger.debug('[MqttServer] publish %s %j', topic, msg);
				socket.emit(topic, msg);
			});

			socket.on("pingreq", function() {
				socket.pingresp();
			});

			(<any>socket).send = (topic: string, msg: any) => {
				socket.publish({
					topic: topic,
					payload: JSON.stringify(msg)
				});
			};

			self.emit("connection", socket);
		});
	}

	send(topic: string, msg: any) {
		this.socket.publish({
			topic: topic,
			payload: msg
		});
	}

	close() {
		if (this.closed) {
			return;
		}

		this.closed = true;
		this.server.close();
		this.emit("closed");
	}
}
