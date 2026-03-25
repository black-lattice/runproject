import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

export const startCodexSession = async ({
  sessionId,
  workspace,
  cliPath,
  cliArgs,
  onEvent,
  onStatus,
  onFileChange,
}) => {
  const unlistenEvent = await listen(`codex-event-${sessionId}`, (event) => {
    onEvent?.(event.payload);
  });

  const unlistenStatus = await listen(`codex-status-${sessionId}`, (event) => {
    onStatus?.(event.payload);
  });

  const unlistenFile = await listen(
    `codex-file-change-${sessionId}`,
    (event) => {
      onFileChange?.(event.payload);
    },
  );

  try {
    const result = await invoke("codex_start_session", {
      sessionId,
      workspace,
      cliPath,
      cliArgs,
    });

    return {
      sessionId: result,
      unlisten: async () => {
        await unlistenEvent();
        await unlistenStatus();
        await unlistenFile();
      },
    };
  } catch (error) {
    await unlistenEvent();
    await unlistenStatus();
    await unlistenFile();
    throw error;
  }
};

export const sendCodexMessage = async ({
  sessionId,
  content,
  files,
  model,
}) => {
  return invoke("codex_send_message", { sessionId, content, files, model });
};

export const approveCodexAction = async ({ sessionId, callId, decision }) => {
  return invoke("codex_approve_action", { sessionId, callId, decision });
};

export const stopCodexSession = async ({ sessionId }) => {
  return invoke("codex_stop_session", { sessionId });
};

export const getCodexAccountList = async () => {
  return invoke("codex_account_list");
};

export const importCurrentCodexAccount = async () => {
  return invoke("codex_account_import_current");
};

export const exportAllCodexAccounts = async ({ path }) => {
  return invoke("codex_account_export_all", { path });
};

export const importCodexAccountArchive = async ({ path }) => {
  return invoke("codex_account_import_archive", { path });
};

export const syncCurrentCodexAccount = async ({ profileName }) => {
  return invoke("codex_account_sync_current", { profileName });
};

export const switchCodexAccount = async ({ profileName }) => {
  return invoke("codex_account_switch", { profileName });
};

export const switchCodexAccountToAvailable = async () => {
  return invoke("codex_account_switch_to_available");
};
