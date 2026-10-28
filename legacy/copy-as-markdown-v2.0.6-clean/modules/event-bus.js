/**
 * Event Bus Module
 * Mimics SillyTavern's eventSource pattern
 * 
 * @author Copy as Markdown Team
 * @version 1.0.0
 */

class EventBus {
  constructor() {
    this.listeners = new Map();
  }
  
  /**
   * Listen to an event (similar to ST's eventSource.on)
   */
  on(eventType, handler) {
    console.log(`[EventBus] Listening to: ${eventType}`);
    
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, []);
    }
    
    this.listeners.get(eventType).push(handler);
  }
  
  /**
   * Remove listener (similar to ST's removeListener)
   */
  off(eventType, handler) {
    if (!this.listeners.has(eventType)) return;
    
    const handlers = this.listeners.get(eventType);
    const index = handlers.indexOf(handler);
    
    if (index > -1) {
      handlers.splice(index, 1);
    }
  }
  
  /**
   * Emit an event (similar to ST's eventSource.emit)
   */
  async emit(eventType, ...data) {
    console.log(`[EventBus] Emitting: ${eventType}`);
    
    if (!this.listeners.has(eventType)) return;
    
    const handlers = this.listeners.get(eventType);
    
    // Execute all handlers sequentially (like ST)
    for (const handler of handlers) {
      try {
        await handler(...data);
      } catch (error) {
        console.error(`[EventBus] Error in ${eventType} handler:`, error);
      }
    }
  }
  
  /**
   * Clear all listeners
   */
  clear() {
    this.listeners.clear();
  }
}

// Export singleton instance (like ST's eventSource)
export const eventBus = new EventBus();

/**
 * Event types (similar to ST's event_types)
 */
export const EVENT_TYPES = {
  SETTINGS_UPDATED: 'SETTINGS_UPDATED',
  CONTEXT_MENU_CLICKED: 'CONTEXT_MENU_CLICKED',
  COPY_SUCCESS: 'COPY_SUCCESS',
  COPY_ERROR: 'COPY_ERROR',
  SELECTION_CHANGED: 'SELECTION_CHANGED'
};
