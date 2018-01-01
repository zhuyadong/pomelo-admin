import { createMasterConsole } from "../lib/consoleService";

const TestModule = require('./module');
const port = 3300;
const host = 'localhost';

const opts = {
	port: port,
	master: true
}

let masterConsole = createMasterConsole(opts);
let mod = TestModule();
masterConsole.register(TestModule.moduleId, mod);

masterConsole.start(function() {

})
