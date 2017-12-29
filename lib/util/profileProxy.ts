import fs = require("fs");

const HeapProfileType = "HEAP";
const CPUProfileType = "CPU";

interface Profiler {
  data: any[];
  finish: boolean;
  typeId: string;
  uid: string;
  title: string;
}

type ProfilerMap = { [idx: string]: Profiler };
type Profilers = {[idx:string]:ProfilerMap};

export = class ProfileProxy {
  private isProfilingCPU: boolean;
  private profiles: Profilers;
  constructor() {
    this.profiles = {
      HEAP: {},
      CPU: {}
    };

    this.isProfilingCPU = false;
  }

  enable(id:string, params:any, clientId:string, agent:any) {
    this.sendResult(
      id,
      {
        result: true
      },
      clientId,
      agent
    );
  }

  causesRecompilation(id:string, params:any, clientId:string, agent) {
    this.sendResult(
      id,
      {
        result: false
      },
      clientId,
      agent
    );
  }

  isSampling(id, params, clientId, agent) {
    this.sendResult(
      id,
      {
        result: true
      },
      clientId,
      agent
    );
  }

  hasHeapProfiler(id, params, clientId, agent) {
    this.sendResult(
      id,
      {
        result: true
      },
      clientId,
      agent
    );
  }

  getProfileHeaders(id, params, clientId, agent) {
    let headers = [];
    for (let type in this.profiles) {
      for (let profileId in this.profiles[type]) {
        let profile = this.profiles[type][profileId];
        headers.push({
          title: profile.title,
          uid: profile.uid,
          typeId: type
        });
      }
    }
    this.sendResult(
      id,
      {
        headers: headers
      },
      clientId,
      agent
    );
  }

  takeHeapSnapshot(id, params, clientId, agent) {
    let uid = params.uid;

    agent.notifyById(uid, "profiler", {
      type: "heap",
      action: "start",
      uid: uid,
      clientId: clientId
    });

    this.sendEvent(
      {
        method: "Profiler.addProfileHeader",
        params: { header: { title: uid, uid: uid, typeId: HeapProfileType } }
      },
      clientId,
      agent
    );
    this.sendResult(id, {}, clientId, agent);
  }

  takeSnapCallBack(data: any) {
    let uid = data.params.uid || 0;
    let snapShot = this.profiles[HeapProfileType][uid];
    if (!snapShot || snapShot.finish) {
      snapShot = {
        data: [],
        finish: false,
        uid: uid,
        title: uid
      };
    }
    if (data.method === "Profiler.addHeapSnapshotChunk") {
      let chunk = data.params.chunk;
      snapShot.data.push(chunk);
    } else {
      snapShot.finish = true;
    }
    this.profiles[HeapProfileType][uid] = snapShot;
  }

  getProfile(id, params, clientId, agent) {
    let profile = this.profiles[params.type][params.uid];
    let self = this;
    if (!profile || !profile.finish) {
      let timerId = setInterval(function() {
        profile = self.profiles[params.type][params.uid];
        if (!!profile) {
          clearInterval(timerId);
          self.asyncGet(id, params, profile, clientId, agent);
        }
      }, 5000);
    } else {
      this.asyncGet(id, params, profile, clientId, agent);
    }
  }

  asyncGet(id, params, snapshot, clientId, agent) {
    let uid = params.uid;
    if (params.type === HeapProfileType) {
      for (let index in snapshot.data) {
        let chunk = snapshot.data[index];
        this.sendEvent(
          {
            method: "Profiler.addHeapSnapshotChunk",
            params: { uid: uid, chunk: chunk }
          },
          clientId,
          agent
        );
      }
      this.sendEvent(
        { method: "Profiler.finishHeapSnapshot", params: { uid: uid } },
        clientId,
        agent
      );
      this.sendResult(
        id,
        {
          profile: { title: snapshot.title, uid: uid, typeId: HeapProfileType }
        },
        clientId,
        agent
      );
    } else if (params.type === CPUProfileType) {
      this.sendResult(
        id,
        {
          profile: {
            title: snapshot.title,
            uid: uid,
            typeId: CPUProfileType,
            head: snapshot.data.head,
            bottomUpHead: snapshot.data.bottomUpHead
          }
        },
        clientId,
        agent
      );
    }
  }

  clearProfiles(id, params) {
    this.profiles.HEAP = {};
    this.profiles.CPU = {};
    //profiler.deleteAllSnapshots();
    //profiler.deleteAllProfiles();
  }

  sendResult(id, res, clientId, agent) {
    agent.notifyClient(
      clientId,
      "profiler",
      JSON.stringify({ id: id, result: res })
    );
  }

  sendEvent(res, clientId, agent) {
    agent.notifyClient(clientId, "profiler", JSON.stringify(res));
  }

  start(id, params, clientId, agent) {
    let uid = params.uid;

    agent.notifyById(uid, "profiler", {
      type: "CPU",
      action: "start",
      uid: uid,
      clientId: clientId
    });
    this.sendEvent(
      { method: "Profiler.setRecordingProfile", params: { isProfiling: true } },
      clientId,
      agent
    );
    this.sendResult(id, {}, clientId, agent);
  }

  stop(id, params, clientId, agent) {
    let uid = params.uid;
    agent.notifyById(uid, "profiler", {
      type: "CPU",
      action: "stop",
      uid: uid,
      clientId: clientId
    });
    this.sendResult(id, {}, clientId, agent);
  }

  stopCallBack(res, clientId, agent) {
    let uid = res.msg.uid;
    let profiler = this.profiles[CPUProfileType][uid];
    if (!profiler || profiler.finish) {
      profiler = {
        data: <any>null,
        finish: true,
        typeId: CPUProfileType,
        uid: uid,
        title: uid
      };
    }
    profiler.data = res;
    this.profiles[CPUProfileType][uid] = profiler;
    this.sendEvent(
      {
        method: "Profiler.addProfileHeader",
        params: {
          header: { title: profiler.title, uid: uid, typeId: CPUProfileType }
        }
      },
      clientId,
      agent
    );
  }
};
