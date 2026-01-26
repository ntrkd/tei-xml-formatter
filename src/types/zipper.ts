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

// Empty class to represent the root of a tree
class Top {}

/**
 * Stores all the context needed to rebuild the tree above the current focus.
 */
class Context<T> {
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

// Assert that the children property when existing must be of type T array.
export class Zipper<T extends { children?: T[] }> {
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
    goDown(): Zipper<T> | null {
        const children = this.focus.data.children;

        // We check if they exist and aren't empty
        if (!children || children.length === 0) {
            return null;
        }

        const rightSiblings = new LinkedList<T>();
        if (children.length > 2) {
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

        return new Zipper<T>(new Focus<T>(children[0]), newContext);
    }

    // Method: goUp()    // Reconstructs parent from focus and siblings
    goUp(): Zipper<T> | null {
        if (this.context.parent_value instanceof Top || this.context.parent_context instanceof Top) {
            return null;
        }

        let parent: T = this.context.parent_value;
        
        if (parent.children === undefined) {
            throw new Error("Expected parent value to have a children property, but found none");
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
        return new Zipper<T>(new Focus<T>(parent), newContext);
    }

    // Method: goLeft()  // Moves focus to the immediate elder sibling
    goLeft(): Zipper<T> | null {
        if (this.context.left_siblings.getSize() < 1) { return null; }
        
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

        return new Zipper<T>(new Focus(newFocus), newContext);
    }

    // Method: goRight() // Moves focus to the immediate younger sibling
    goRight(): Zipper<T> | null {
        if (this.context.right_siblings.getSize() < 1) { return null; }
        
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

        return new Zipper<T>(new Focus(newFocus), newContext);
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
    insertDown(node: T): Zipper<T> | null {
        let newData = this.focus.data;
        if (newData.children === undefined) {
            return null;
        }

        newData.children.unshift(node);

        return new Zipper<T>(new Focus<T>(newData), this.context);
    }

    // Method: delete()    // Removes focus and shifts to neighbor
    // If we implement this, the Focus would need to be changed to also hold a null value
    // when we attempt to delete a leaf node with no siblings. Currently, it would only be
    // possible to delete a leaf node if we then moved up. However, that functionality is
    // undesired as it causes an unexpected movement.
}