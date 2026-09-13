import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";

// Execute the actual JSX and event handlers. This small hook harness deliberately
// runs effect cleanup without blur, as React does when filtering removes a row.
const require = createRequire(import.meta.url);
const viteRequire = createRequire(require.resolve("vite/package.json"));
const { transformSync } = viteRequire("esbuild");
const code = transformSync(
  readFileSync(
    new URL(
      "../src/pages/welcome/components/TaskTitleInput.jsx",
      import.meta.url,
    ),
    "utf8",
  ),
  { loader: "jsx", jsx: "automatic", format: "cjs" },
).code;
function componentSession() {
  let active;
  const react = Object.fromEntries(
    ["useState", "useRef", "useEffect"].map((name) => [
      name,
      (...args) => active[name](...args),
    ]),
  );
  const jsx = (type, props) => ({ type, props });
  const module = { exports: {} };
  vm.runInNewContext(code, {
    module,
    exports: module.exports,
    TextEncoder,
    require: (name) => {
      if (name === "react") return react;
      if (name === "antd") return { Input: "input" };
      if (name === "react/jsx-runtime") return { jsx, jsxs: jsx };
      throw new Error(`Unexpected component import: ${name}`);
    },
  });
  const Component = module.exports.default;
  const commits = [];
  const findInput = (node) => {
    if (!node) return null;
    if (Array.isArray(node)) return node.map(findInput).find(Boolean);
    return node.type === "input" ? node.props : findInput(node.props?.children);
  };
  return {
    commits,
    mount(initialTask) {
      let hookIndex, dirty, jobs, props, tree;
      const hooks = [];
      const runtime = {
        useState(initial) {
          const index = hookIndex++;
          hooks[index] ??= {
            value: typeof initial === "function" ? initial() : initial,
          };
          return [
            hooks[index].value,
            (value) => {
              const next =
                typeof value === "function" ? value(hooks[index].value) : value;
              if (!Object.is(next, hooks[index].value)) {
                hooks[index].value = next;
                dirty = true;
              }
            },
          ];
        },
        useRef(initial) {
          const index = hookIndex++;
          return (hooks[index] ??= { current: initial });
        },
        useEffect(callback, deps) {
          const index = hookIndex++;
          const previous = hooks[index];
          if (
            !previous ||
            deps.some((value, i) => !Object.is(value, previous.deps[i]))
          ) {
            const effect = (hooks[index] = { deps, cleanup: null });
            jobs.push(() => {
              previous?.cleanup?.();
              effect.cleanup = callback();
            });
          }
        },
      };
      const render = (task = props?.task, onCommit = props?.onCommit) => {
        props = {
          task,
          onCommit: onCommit || ((title, id) => commits.push([title, id])),
        };
        let count = 0;
        do {
          if (++count > 10) throw new Error("Unexpected render loop");
          hookIndex = 0;
          dirty = false;
          jobs = [];
          active = runtime;
          tree = Component(props);
          jobs.forEach((job) => job());
        } while (dirty);
        return findInput(tree);
      };
      render(initialTask);
      return {
        render,
        input: () => findInput(tree),
        edit(value) {
          findInput(tree).onChange({ target: { value } });
          return render();
        },
        key(key, composing = false) {
          const input = findInput(tree);
          let blurred = 0;
          input.onKeyDown({
            key,
            nativeEvent: { isComposing: composing },
            preventDefault() {},
            stopPropagation() {},
            currentTarget: {
              blur() {
                blurred++;
                input.onBlur();
              },
            },
          });
          render();
          return blurred;
        },
        unmount() {
          for (const hook of hooks)
            if (typeof hook.cleanup === "function") {
              const cleanup = hook.cleanup;
              hook.cleanup = null;
              cleanup();
            }
        },
      };
    },
  };
}
const first = { id: "A", title: "原始任务标题" };
const second = { id: "B", title: "第二个任务标题" };

test("focusing an untouched title does not overwrite an MCP rename on blur or unmount", () => {
  const session = componentSession(),
    view = session.mount(first);
  view.input().onFocus?.();
  const input = view.render({ ...first, title: "MCP 新标题" });
  assert.equal(input.value, "MCP 新标题");
  input.onBlur();
  view.unmount();
  assert.deepEqual(session.commits, []);
});
test("switching tasks without blur saves a valid draft using its original task ID", () => {
  const session = componentSession(),
    view = session.mount(first);
  view.edit("  A 的未提交草稿  ");
  const callsToNewCallback = [];
  const input = view.render(second, (title, id) =>
    callsToNewCallback.push([title, id]),
  );
  assert.equal(input.value, second.title);
  assert.deepEqual(callsToNewCallback, [["A 的未提交草稿", "A"]]);
  input.onBlur();
  view.unmount();
  assert.deepEqual(callsToNewCallback, [["A 的未提交草稿", "A"]]);
});
test("unmount without blur saves a valid draft once and retains the task ID", () => {
  const session = componentSession(),
    view = session.mount(first);
  view.edit("卸载前草稿");
  view.unmount();
  view.unmount();
  assert.deepEqual(session.commits, [["卸载前草稿", "A"]]);
});
test("Enter followed by blur, task switch and cleanup submits only once", () => {
  const session = componentSession(),
    view = session.mount(first);
  view.edit("  编辑标题  ");
  assert.equal(view.key("Enter"), 1);
  assert.equal(view.input().value, "编辑标题");
  view.input().onBlur();
  view.render(second);
  view.unmount();
  assert.deepEqual(session.commits, [["编辑标题", "A"]]);
});
test("an overlong draft survives task switching and unmount, never entering another task", () => {
  const session = componentSession(),
    view = session.mount(first);
  const invalid = "文".repeat(334);
  view.edit(invalid);
  assert.equal(view.key("Enter"), 0);
  assert.equal(view.input().value, invalid);
  assert.equal(view.input().status, "error");
  view.render(second);
  assert.equal(view.input().value, second.title);
  view.edit("B 的有效编辑");
  view.unmount();
  assert.deepEqual(session.commits, [["B 的有效编辑", "B"]]);
  const reopened = session.mount({ ...first, title: "A 的远端新标题" });
  assert.equal(reopened.input().value, invalid);
  assert.equal(reopened.input().status, "error");
  reopened.edit("修复后的 A 草稿");
  reopened.key("Enter");
  reopened.unmount();
  assert.deepEqual(session.commits, [
    ["B 的有效编辑", "B"],
    ["修复后的 A 草稿", "A"],
  ]);
});
test("blank draft remains session-only after unmount; Escape restores latest title and clears draft", () => {
  const session = componentSession(),
    view = session.mount(first);
  view.edit(" ");
  view.input().onBlur();
  view.render();
  assert.equal(view.input().value, " ");
  assert.equal(view.input().status, "error");
  view.unmount();
  assert.deepEqual(session.commits, []);
  const reopened = session.mount({ ...first, title: "MCP 最新标题" });
  assert.equal(reopened.input().value, " ");
  reopened.key("Escape");
  assert.equal(reopened.input().value, "MCP 最新标题");
  reopened.input().onBlur();
  reopened.unmount();
  assert.deepEqual(session.commits, []);
  const third = session.mount({ ...first, title: "下一次 MCP 标题" });
  assert.equal(third.input().value, "下一次 MCP 标题");
  third.unmount();
});
test("a real local edit is preserved across an MCP rename and saves against the same task", () => {
  const session = componentSession(),
    view = session.mount(first);
  view.edit("我的本地修改");
  view.render({ ...first, title: "并发远端名称" });
  assert.equal(view.input().value, "我的本地修改");
  view.input().onBlur();
  view.unmount();
  assert.deepEqual(session.commits, [["我的本地修改", "A"]]);
});
test("IME Enter does not commit; returning to the current title leaves no stale draft", () => {
  const session = componentSession(),
    view = session.mount(first);
  view.edit("正在输入");
  assert.equal(view.key("Enter", true), 0);
  assert.deepEqual(session.commits, []);
  view.edit(first.title);
  view.render({ ...first, title: "外部更名" });
  assert.equal(view.input().value, "外部更名");
  view.unmount();
  assert.deepEqual(session.commits, []);
});
