import * as vscode from "vscode";
import {
  Disposable,
  ExtensionContext,
  TextDocument,
  TextDocumentChangeEvent
} from "vscode";

import { wolfStandardApiFactory, WolfAPI } from "./api";
import { hotModeWarning } from "./hotWarning";
import { ActiveTextEditorChangeEventResult } from "./types";
import { clamp } from "./utils";

export function activate(context: ExtensionContext) {
  const wolfAPI: WolfAPI = wolfStandardApiFactory(context);

  function startWolf() {
    const _init = () => {
      wolfAPI.stepInWolf();
      wolfAPI.enterWolfContext();
      throttledHandleDidSaveTextDocument();
    };
    if (wolfAPI.isHot && !wolfAPI.hotModeWarningDisabled) {
      return hotModeWarning(_init);
    }
    _init();
  }

  function stopWolf() {
    wolfAPI.stopWolf();
    wolfAPI.exitWolfContext();
    cancelPending();
  }

  const wolfStartCommand: Disposable = vscode.commands.registerCommand(
    "wolf.barkAtCurrentFile",
    startWolf
  );

  const wolfStartAction: Disposable = vscode.commands.registerCommand(
    "wolf.touchBarStart",
    startWolf
  );

  const wolfStopCommand: Disposable = vscode.commands.registerCommand(
    "wolf.stopBarking",
    stopWolf
  );

  const wolfStopAction: Disposable = vscode.commands.registerCommand(
    "wolf.touchBarStop",
    stopWolf
  );

  context.subscriptions.push(
    wolfStartAction,
    wolfStartCommand,
    wolfStopAction,
    wolfStopCommand
  );

  vscode.window.onDidChangeActiveTextEditor(
    handleDidChangeActiveTextEditor,
    null,
    context.subscriptions
  );

  vscode.workspace.onDidChangeTextDocument(
    handleDidChangeTextDocument,
    null,
    context.subscriptions
  );

  vscode.workspace.onDidSaveTextDocument(
    handleDidSaveTextDocument,
    null,
    context.subscriptions
  );

  vscode.workspace.onDidChangeConfiguration(
    handleDidChangeConfiguration,
    null,
    context.subscriptions
  );

  function handleDidChangeActiveTextEditor(
    editor: ActiveTextEditorChangeEventResult
  ): void {
    if (editor) {
      wolfAPI.updateLineCount(editor.document.lineCount);
      if (wolfAPI.sessions.sessionIsActiveByDocument(editor.document)) {
        if (wolfAPI.configChanged) {
          vscode.window.showInformationMessage(
            "Wolf detected a change to its configuration and was shut off. Please start Wolf again to continue."
          );
          wolfAPI.setConfigUpdatedFlag(false);
          stopWolf();
        } else {
          throttledHandleDidSaveTextDocument(false);
          wolfAPI.enterWolfContext();
        }
      } else {
        wolfAPI.exitWolfContext();
      }
    }
  }

  function handleDidChangeTextDocument(event: TextDocumentChangeEvent): void {
    if (wolfAPI.isDocumentWolfSession(event.document)) {
      throttledHandleDidChangeTextDocument(event);
      if (wolfAPI.isHot) {
        wolfAPI.activeEditor.document.save();
      }
    }
  }

  function handleDidSaveTextDocument(document: TextDocument): void {
    if (wolfAPI.isDocumentWolfSession(document)) {
      wolfAPI.updateLineCount(document.lineCount);
      throttledHandleDidSaveTextDocument(true);
    }
  }

  function handleDidChangeConfiguration(event) {
    if (
      event.affectsConfiguration("wolf.hot") ||
      event.affectsConfiguration("wolf.pawPrintsInGutter") ||
      event.affectsConfiguration("wolf.hotFrequency")
    ) {
      wolfAPI.setConfigUpdatedFlag(true);
    }
  }

  let updateTimeout = null;
  let stickyTimeout = null;

  function cancelPending(): void {
    [updateTimeout, stickyTimeout].forEach(pending => {
      if (pending) clearTimeout(pending);
    });
  }

  function throttledHandleDidSaveTextDocument(trace: boolean = true): void {
    if (updateTimeout) {
      clearTimeout(updateTimeout);
    }
    updateTimeout = setTimeout(
      () => wolfAPI.handleDidSaveTextDocument(trace),
      wolfAPI.isHot ? clamp(100, 10000, wolfAPI.hotFrequency) : 500
    );
  }

  function throttledHandleDidChangeTextDocument(
    event: TextDocumentChangeEvent
  ): void {
    if (stickyTimeout) {
      clearTimeout(stickyTimeout);
    }
    stickyTimeout = setTimeout(
      () => wolfAPI.handleDidChangeTextDocument(event),
      450
    );
  }
}
