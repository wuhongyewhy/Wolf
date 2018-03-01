import * as path from "path";
import { getActiveEditor, getActiveFileName, indexOrLast } from "./utils";
import { WorkspaceConfiguration } from "vscode";
import { WolfTracerInterface, WolfParsedTraceResults } from "./types";
import { installHunter } from "./hunterInstaller";

const { spawn } = require("child_process");

export function pythonTracerFactory(config: WorkspaceConfiguration) {
  return new PythonTracer(config);
}

export class PythonTracer {
  constructor(config: WorkspaceConfiguration) {}

  private getPythonRunner(rootDir) {
    const scriptName: string = getActiveFileName();
    const wolfPath: string = path.join(rootDir, "scripts/wolf.py");
    return spawn("python", [wolfPath, scriptName]);
  }

  public tracePythonScript({
    rootDir,
    afterInstall,
    onData,
    onError
  }: WolfTracerInterface) {
    if (!getActiveEditor()) return;

    const python = this.getPythonRunner(rootDir);

    python.stderr.on("data", (data: Buffer) => {
      if (data.includes("IMPORT_ERROR")) {
        installHunter(afterInstall);
      } else {
        onError(new String(data));
      }
    });

    python.stdout.on("data", (data: Buffer): void => {
      const wolfResults = this.tryParsePythonData(data);
      if (wolfResults) {
        onData(wolfResults);
      }
    });
  }

  private tryParsePythonData(jsonish: Buffer): WolfParsedTraceResults {
    const index = indexOrLast(jsonish + "", "WOOF:");
    if (index !== -1) {
      try {
        return JSON.parse(new String(jsonish).slice(index));
      } catch (err) {
        console.error("Error parsing Wolf output. ->");
        console.error(err);
      }
    } else {
      return null;
    }
  }
}
