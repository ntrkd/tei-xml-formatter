import { LinkedList } from './linkedList';

/**
 * Stores the current node. Everything at and below this node is stored as the original tree.
 */
export class Focus<T> {
    data: T;

    constructor(
        data: T
    ) {
        this.data = data;
    }
}

/** Empty class to represent the root of a tree */
export class Top {}

/** Stores all the context needed to rebuild the tree above the current focus. */
export class Context<T> {
    left_siblings: LinkedList<T>;
    parent_context: Top | Context<T>;
    parent_value: Top | T;
    right_siblings: LinkedList<T>;

    constructor(
        left_siblings: LinkedList<T>,
        parent_context: Top | Context<T>,
        parent_value: Top | T,
        right_siblings: LinkedList<T>
    ) {
        this.left_siblings = left_siblings;
        this.parent_context = parent_context;
        this.parent_value = parent_value;
        this.right_siblings = right_siblings;
    }
}

export enum ZipperError {
    LEAF_NODE = 'LEAF_NODE',
    NO_SIBLING = 'NO_SIBLING',
    AT_ROOT = 'AT_ROOT',
    AT_END = 'AT_END',
    PARENT_HAS_NO_CHILDREN = 'PARENT_HAS_NO_CHILDREN',
    INVALID_PARENT = 'INVALID_PARENT'
}

export type ZipperMod<T extends object> =
    | { success: true; zipper: Zipper<T> }
    | { success: false; reason: ZipperError; message?: string };

export class Zipper<T extends object> {
    focus: Focus<T>;
    context: Context<T>;

    constructor(
        focus: Focus<T>,
        context: Context<T>
    ) {
        this.focus = focus;
        this.context = context;
    }

    // Method: goDown()  // Moves focus to the first child of a Section
    goDown(): ZipperMod<T> {
        if (!this.hasChildren(this.focus.data)) {
            return { success: false, reason: ZipperError.LEAF_NODE };
        }

        const children = this.focus.data.children;

        if (!children || children.length === 0) {
            return { success: false, reason:ZipperError.LEAF_NODE };
        }

        const rightSiblings = new LinkedList<T>();
        if (children.length >= 2) {
            for (let i = 1; i < children.length; i++) {
                rightSiblings.append(children[i]);
            }
        }

        const newContext = new Context<T>(
            new LinkedList<T>(),
            this.context,
            this.focus.data,
            rightSiblings
        );

        return { success: true, zipper: new Zipper<T>(new Focus<T>(children[0]), newContext) };
    }

    // Method: goUp()    // Reconstructs parent from focus and siblings
    goUp(): ZipperMod<T> {
        // Check both values to avoid TS compile errors
        if (this.context.parent_value instanceof Top || this.context.parent_context instanceof Top) {
            return { success: false, reason: ZipperError.AT_ROOT };
        }

        const parentContext = this.context.parent_context as Context<T>;
        let parent: T = this.context.parent_value as T;
        
        if (!this.hasChildren(parent)) {
            return { success: false, reason: ZipperError.PARENT_HAS_NO_CHILDREN };
        }

        let childrenArr: T[] = [];
        
        // Loop through left siblings and append to childrenArr
        let current = this.context.left_siblings.getHead();
        while (current !== null) {
            childrenArr.push(current.data);
            current = current.next;
        }
        
        // Push the current focus
        childrenArr.push(this.focus.data);
        
        // Loop through right siblings and append to childrenArr
        current = this.context.right_siblings.getHead();
        while (current !== null) {
            childrenArr.push(current.data);
            current = current.next;
        }
        
        parent.children = childrenArr;

        let newContext = new Context<T>(
            this.context.parent_context.left_siblings, 
            this.context.parent_context.parent_context, 
            this.context.parent_context.parent_value, 
            this.context.parent_context.right_siblings
        );

        return { success: true, zipper: new Zipper<T>(new Focus<T>(parent), newContext) };
    }

    // Method: goLeft()  // Moves focus to the immediate elder sibling
    goLeft(): ZipperMod<T> {
        if (this.context.left_siblings.getSize() <= 0) {
            return { success: false, reason: ZipperError.NO_SIBLING };
        }
        
        // Prepend focus into right_sib
        this.context.right_siblings.prepend(this.focus.data);
        
        let newFocus = this.context.left_siblings.deleteTail()?.data;
        if (newFocus === undefined) {
            throw new Error("Expected a non-null return from LinkedList while deleting tail but got null");
        }

        let newContext = new Context<T>(
            this.context.left_siblings,
            this.context.parent_context,
            this.context.parent_value,
            this.context.right_siblings
        );

        return { success: true, zipper: new Zipper<T>(new Focus(newFocus), newContext) };
    }

    // Method: goRight() // Moves focus to the immediate younger sibling
    goRight(): ZipperMod<T> {
        if (this.context.right_siblings.getSize() <= 0) {
            return { success: false, reason: ZipperError.NO_SIBLING };
        }
        
        this.context.left_siblings.append(this.focus.data);
        
        let newFocus = this.context.right_siblings.deleteHead()?.data;
        if (newFocus === undefined) {
            throw new Error("Expected a non-null return from LinkedList while deleting head but got null");
        }

        let newContext = new Context<T>(
            this.context.left_siblings,
            this.context.parent_context,
            this.context.parent_value,
            this.context.right_siblings
        );

        return { success: true, zipper: new Zipper<T>(new Focus(newFocus), newContext) };
    }

    // goNext()
    goNext(): ZipperMod<T> {
        // try to go down
        let goDown = this.goDown();

        if (goDown.success) {
            return goDown;
        }

        // try to go right
        let goRight = this.goRight();

        if (goRight.success) {
            return goRight;
        }

        // loop go up and go right until go right works or we cant go up anymore
        let current: Zipper<T> = this;
        do {
            let goUp = current.goUp();

            if (goUp.success) {
                goRight = goUp.zipper.goRight();

                if (goRight.success) {
                    return goRight;
                } else {
                    current = goUp.zipper;
                }
            } else {
                if (goUp.reason === ZipperError.AT_ROOT || goUp.reason === ZipperError.PARENT_HAS_NO_CHILDREN) {
                    break;
                }
            }
        } while(true);

        return { success: false, reason: ZipperError.AT_END };
    }

    // goPrevious()
    goPrevious(): ZipperMod<T> {
        // go left
        // if successful find if it has children and move to the final child
        let goLeft = this.goLeft();
        if (goLeft.success) {
            // find child
            let goDown = goLeft.zipper.goDown();
            if (goDown.success) {
                let current: ZipperMod<T> = goDown;

                // loop goRight until we can't anymore and return goRight
                while (true) {
                    let currentShifted: ZipperMod<T> = current.zipper.goRight();
                    if (currentShifted.success) {
                        current = currentShifted;
                    } else {
                        break;
                    }
                }

                return current;
            }

            return goLeft;
        }

        // go up
        let goUp: ZipperMod<T> = this.goUp();
        if (goUp.success) {
            return goUp;
        } else {
            return { success: false, reason: ZipperError.AT_ROOT };
        }
    }

    // Move to the root using goPrevious()
    goTop(): ZipperMod<T> {
        let current: Zipper<T> = this;
        while (true) {
            const prev = current.goPrevious();
            if (prev.success) {
                current = prev.zipper;
                continue;
            } else {
                if (prev.reason === ZipperError.AT_ROOT) {
                    return { success: true, zipper: current };
                } else {
                    return { success: false, reason: prev.reason, message: prev.message };
                }
            }
        }
    }

    // --- METHODS: MODIFICATION ---
    // Method: change(Tree newTree)    // Replaces the current focus
    replace(replacement: T): Zipper<T> {
        return new Zipper<T>(new Focus(replacement), this.context);
    } 

    // Method: insertLeft(Tree tree)   // Adds a sibling to the left
    insertLeft(node: T): Zipper<T> {
        let leftSibling = this.context.left_siblings;
        leftSibling.append(node);

        return new Zipper<T>(
            this.focus,
            new Context<T>(
                leftSibling,
                this.context.parent_context,
                this.context.parent_value,
                this.context.right_siblings
            )
        );
    }

    // Method: insertRight(Tree tree)  // Adds a sibling to the right
    insertRight(node: T): Zipper<T> {
        let rightSibling = this.context.right_siblings;
        rightSibling.prepend(node);

        return new Zipper<T>(
            this.focus,
            new Context<T>(
                this.context.left_siblings,
                this.context.parent_context,
                this.context.parent_value,
                rightSibling
            )
        );
    }

    /**
     * Insert a node as a child into the current Focus
     * @param node item to insert as child
     * @returns Zipper object if insertion was successful else null
     */
    insertDown(node: T): ZipperMod<T> {
        let newData = this.focus.data;
        
        // Type guards
        if (!this.hasChildren(newData)) {
            return { success: false, reason: ZipperError.LEAF_NODE };
        }

        newData.children.unshift(node);

        return { success: true, zipper: new Zipper<T>(new Focus<T>(newData), this.context) };
    }

    /**
     * Generic type guard to check if a node has a children array.
     */
    hasChildren<U>(node: U): node is U & { children: U[] } {
        return (
            node !== null &&
            typeof node === 'object' &&
            'children' in node &&
            Array.isArray((node as any).children)
        );
    }

    // Method: delete()    // Removes focus and shifts to neighbor
    // If we implement this, the Focus would need to be changed to also hold a null value
    // when we attempt to delete a leaf node with no siblings. Currently, it would only be
    // possible to delete a leaf node if we then moved up. However, that functionality is
    // undesired as it causes an unexpected movement.
}