const os = require("node:os");

process.env.NODE_OPTIONS = `--require "${__filename.replaceAll("\\", "/")}"`;
if (!process.geteuid) process.geteuid = () => 0;

const userInfo = os.userInfo;
Object.defineProperty(os, "userInfo", { value: (...args) => {
  try {
    return userInfo(...args);
  } catch {
    return { username: "contentos", uid: -1, gid: -1, shell: null, homedir: process.cwd() };
  }
}, configurable: true });
