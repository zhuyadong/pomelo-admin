declare module "mqtt-connection" {
  import { Duplexify } from "duplexify";
  import { Transform, Stream, Duplex, Writable, Readable } from "stream";
  class Connection extends Duplex {
    id:number;
    constructor(duplex: Duplex, opts?: any);
    connect(opts: any, cb?: Function): void;
    connack(opts: any, cb?: Function): void;
    publish(opts: any, cb?: Function): void;
    puback(opts: any, cb?: Function): void;
    pubrec(opts: any, cb?: Function): void;
    pubrel(opts: any, cb?: Function): void;
    pubcomp(opts: any, cb?: Function): void;
    subscribe(opts: any, cb?: Function): void;
    suback(opts: any, cb?: Function): void;
    unsubscribe(opts: any, cb?: Function): void;
    unsuback(opts: any, cb?: Function): void;
    pingreq(opts?: any, cb?: Function): void;
    pingresp(opts?: any, cb?: Function): void;
    disconnect(opts?: any, cb?: Function): void;
    destroy(): void;
    setWritable(writable: Writable): void;
    setReadable(readable: Readable): void;
    send(topic:string, msg:any):void; //mqttServer.ts:listen
    static parseStream(): Transform;
    static generateStream(): Transform;
  }

  export = Connection;
}