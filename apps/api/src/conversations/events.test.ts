import { describe, expect, it, vi } from "vitest";
import { createConversationEvents } from "./events.ts";

describe("createConversationEvents", () => {
  it("avisa o funcionário dono da conversa e o console, e mais ninguém", () => {
    const events = createConversationEvents();
    const ana = vi.fn();
    const bruno = vi.fn();
    const console = vi.fn();
    events.subscribe("employee:emp-ana", ana);
    events.subscribe("employee:emp-bruno", bruno);
    events.subscribe("console", console);

    events.conversationChanged("emp-ana");
    expect(ana).toHaveBeenCalledOnce();
    expect(console).toHaveBeenCalledOnce();
    expect(bruno).not.toHaveBeenCalled();
  });

  it("para de avisar depois de cancelar a inscrição", () => {
    const events = createConversationEvents();
    const ana = vi.fn();
    const unsubscribe = events.subscribe("employee:emp-ana", ana);
    unsubscribe();
    events.conversationChanged("emp-ana");
    expect(ana).not.toHaveBeenCalled();
  });
});
