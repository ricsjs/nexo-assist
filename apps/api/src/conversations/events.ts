// Avisos em tempo real: "esta conversa mudou". Quem ouve busca a conversa pela rota normal
// (que checa o login), então nenhum dado trafega pelo aviso.
// Em memória, para uma instância só; com várias, trocaria por Redis pub/sub (ver README).

export type Topic = `employee:${string}` | "console";

export function createConversationEvents() {
  const listeners = new Map<Topic, Set<() => void>>();

  return {
    subscribe(topic: Topic, listener: () => void): () => void {
      const set = listeners.get(topic) ?? new Set();
      set.add(listener);
      listeners.set(topic, set);
      return () => {
        set.delete(listener);
        if (set.size === 0) listeners.delete(topic);
      };
    },

    // Toda mudança numa conversa avisa o funcionário dono dela e o console.
    conversationChanged(employeeId: string): void {
      for (const topic of [`employee:${employeeId}`, "console"] as const) {
        for (const listener of listeners.get(topic) ?? []) listener();
      }
    },
  };
}

export type ConversationEvents = ReturnType<typeof createConversationEvents>;
