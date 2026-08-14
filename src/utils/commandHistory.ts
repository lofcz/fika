export interface Command {
  do(): void;
  undo(): void;
}
export class CommandHistory {
  private undoStack: Command[] = [];
  private redoStack: Command[] = [];
  constructor(private readonly maxSize = 50, private readonly onChange?: () => void) {}
  get canUndo() {
    return this.undoStack.length > 0;
  }
  get canRedo() {
    return this.redoStack.length > 0;
  }
  execute(command: Command) {
    command.do();
    this.undoStack.push(command);
    this.redoStack = [];
    if (this.undoStack.length > this.maxSize) this.undoStack.shift();
    this.onChange?.();
  }
  undo() {
    const command = this.undoStack.pop();
    if (!command) return false;
    command.undo();
    this.redoStack.push(command);
    this.onChange?.();
    return true;
  }
  redo() {
    const command = this.redoStack.pop();
    if (!command) return false;
    command.do();
    this.undoStack.push(command);
    this.onChange?.();
    return true;
  }
  clear() {
    this.undoStack = [];
    this.redoStack = [];
    this.onChange?.();
  }
}
