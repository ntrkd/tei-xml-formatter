import { Range, TextLine } from "vscode";
import { Position } from "vscode";
import { TextDocument } from "vscode";
import { Token, TokenType } from "./token";
import { posix } from "path";
import { randomBytes } from "crypto";

/**
 * @param document the document the lexer will tokenize.
 * @param readPos the current position the lexer is at.
 * @param peekPos the position the lexer has peeked to for context.
 */
type LexerState = {
    document: TextDocument;

    readPos: Position | undefined;
    peekPos: Position;
    currChar: string;
}

export class Lexer {
    /**
     * Holds the state of the Lexer at any given point
     */
    state: LexerState;
    /**
     * Intialize an empty TokenType array to hold the tokens we parse
     */
    tokens: TokenType[] = [];

    /**
     * Initalize the Lexer class instance
     * @param document VSCode TextDocument to parse
     */
    constructor(document: TextDocument) {
        this.state = {
            document: document,
            readPos: new Position(0, 0),
            peekPos: new Position(0, 0),
            currChar: document.getText(new Range(new Position(0, 0), new Position(0, 1)))
        };
        
    }

    /**
     * Start the lexing from start to finish for the given document
     */
    start() {
        
    }

    /**
     * Gets and returns the next token in the document
     * @returns the next token or undefined if we have reached the end of the document
     */
    nextToken() : Token | undefined {
        let tok: Token; // Return token
        if (this.state.readPos === undefined) { return undefined; };
        this.state.peekPos = this.state.readPos;
        this.state.currChar = this.state.document.getText(new Range(this.state.readPos, new Position(this.state.readPos.line, this.state.readPos.character + 1)));

        // When the currChar is undefined we are at the end of the line
        switch (this.state.currChar) {
            case " ": {
                tok = { Name: "WhiteSpace", Literal: " ", Range: new Range(this.state.readPos, new Position(0, 0))};
                
                do {
                    let nextPosReturn: Range | undefined = this.nextPosition(this.state.peekPos);
                    if (nextPosReturn === undefined) { break; }
                    this.state.peekPos = nextPosReturn.start;
                } while(this.state.document.getText(new Range(this.state.peekPos, new Position(this.state.peekPos.line, this.state.peekPos.character + 1))) === " ");

                tok.Range = new Range(this.state.readPos, this.state.peekPos);
                tok.Literal = this.state.document.getText(tok.Range);
                break;
            }
            default: {
                let rng = new Range(this.state.readPos, new Position(this.state.readPos.line, this.state.readPos.character + 1));
                tok = { Name: "Illegal", Literal: this.state.document.getText(rng), Range: rng };
                break;
            }
        }

        // Set the readPos equal to peekPos
        let nextPos = this.nextPosition(this.state.peekPos);
        if (nextPos === undefined) {
            // reached the end of the document
            this.state.readPos = undefined;
        } else {
            this.state.readPos = nextPos.start;
        }

        return tok;
    }
    
    nextPosition(pos: Position): Range | undefined {
        // Get the next char on the same line to check if we are at the end of the current line
        let nextChar: string = this.state.document.getText(new Range(new Position(pos.line, pos.character + 1), new Position(pos.line, pos.character + 2)));

        if (nextChar === "" && pos.line + 1 < this.state.document.lineCount) {
            let nextLine = this.nextNonEmptyLine(pos.line + 1);
            return new Range(new Position(nextLine, 0), new Position(nextLine, 1));
        } else if (nextChar === "" && pos.line + 1 >= this.state.document.lineCount) {
            return undefined;
        }

        return new Range(new Position(pos.line, pos.character + 1), new Position(pos.line, pos.character + 2));
    }

    /**
     * Helper method to skip empty lines
     * @param line Line to start checking from
     * @returns next linenumber that contains characters
     */
    nextNonEmptyLine(line: number): number {
        let lineObj = this.state.document.lineAt(line);
        while (lineObj.text === "") {
            lineObj = this.state.document.lineAt(lineObj.lineNumber + 1);
        }

        return lineObj.lineNumber;
    }

    /**
     * Method to get Tokens
     * @returns An array of currently parsed Tokens
     */
    getTokens(): TokenType[] {
        return this.tokens;
    }

    // TODO: Make something that can go char by char then when it hits the new line go to the next line. Newlines shouldn't matter and we should be able to safley disregard them
}