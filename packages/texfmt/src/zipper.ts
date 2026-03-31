// Slightly modified implementation of https://gallium.inria.fr/~huet/PUBLIC/zip.pdf

export type Focus<Item> = Item;

export enum ContextVariant {
	ROOT,
	CHILD,
};

export type RootContext = {
	kind: ContextVariant.ROOT;
};

export type ChildContext<Item> = {
	kind: ContextVariant.CHILD,
	parent: Item;
	parent_context: Context<Item>;
	left_siblings: Item[];
	right_siblings: Item[];
};

export type Context<Item> = RootContext | ChildContext<Item>;

export type Zipper<Item> = {
	focus: Focus<Item>;
	context: Context<Item>;
    adapter: ZipperAdapter<Item>;
};

export type ZipperAdapter<Item> = {
    isLeaf(node: Item): boolean;
    getChildren(node: Item): Item[];
    makeNode(node: Item, children: Item[]): Item;
}

export enum ZipperError {
	AT_ROOT,
	AT_END,
	NO_SIBLING,
	NO_CHILDREN,
    LEAF_NODE,
	IMPOSSIBLE_STATE,
}

export type ZipperResult<Item> =
	| { success: true; zipper: Zipper<Item> }
	| { success: false; code: ZipperError; message: string };

export type PeekResult<Item> =
	| { success: true; item: Item }
	| { success: false; code: ZipperError; message: string };

function goLeft<Item>(zipper: Zipper<Item>): ZipperResult<Item> {
    const ctx = zipper.context;

	if (ctx.kind === ContextVariant.ROOT) {
		return {
			success: false,
			code: ZipperError.AT_ROOT,
			message: "no siblings at top",
		};
	}

    const { parent, parent_context, left_siblings, right_siblings } = ctx;
    const lastIndex = left_siblings.length;
	const left_node = left_siblings[lastIndex - 1];

	if (left_node === undefined) {
		return {
			success: false,
			code: ZipperError.NO_SIBLING,
			message: "no left siblings",
		};
	}

	return {
		success: true,
		zipper: {
			focus: left_node,
			context: {
				kind: ContextVariant.CHILD,
				parent: parent,
				parent_context: parent_context,
				left_siblings: left_siblings.slice(0, lastIndex - 1),
				right_siblings: right_siblings,
			},
            adapter: zipper.adapter,
		},
	};
}

function goRight<Item>(zipper: Zipper<Item>): ZipperResult<Item> {
    const ctx = zipper.context;

	if (ctx.kind === ContextVariant.ROOT) {
		return {
			success: false,
			code: ZipperError.AT_ROOT,
			message: "no siblings at top",
		};
	}


    const { parent, parent_context, left_siblings, right_siblings } = ctx;
	const right_node = right_siblings[0];

    if (right_node === undefined) {
		return {
			success: false,
			code: ZipperError.NO_SIBLING,
			message: "no right siblings",
		};
    }

    return {
		success: true,
		zipper: {
			focus: right_node,
			context: {
				kind: ContextVariant.CHILD,
				parent: parent,
				parent_context: parent_context,
				left_siblings: left_siblings,
				right_siblings: right_siblings.slice(1),
			},
            adapter: zipper.adapter,
		},
    };
}

function goUp<Item>(zipper: Zipper<Item>): ZipperResult<Item> {
    const ctx = zipper.context;

	if (ctx.kind === ContextVariant.ROOT) {
		return {
			success: false,
			code: ZipperError.AT_ROOT,
			message: "no parent at top",
		};
	}

    const { parent, parent_context, left_siblings, right_siblings } = ctx;
    const children: Item[] = [...left_siblings, zipper.focus, ...right_siblings];

    const newParent = zipper.adapter.makeNode(parent, children);

	return {
		success: true,
		zipper: {
			focus: newParent,
			context: parent_context,
            adapter: zipper.adapter,
		},
	};
}

function goDown<Item>(zipper: Zipper<Item>): ZipperResult<Item> {
    const ctx = zipper.context;
    const children = zipper.adapter.getChildren(zipper.focus);

    const [newFocus, ...right_siblings] = children; 
    const newCtx = { kind: ContextVariant.CHILD, parent: zipper.focus, parent_context: ctx, left_siblings: [], right_siblings: right_siblings };

    if (newFocus === undefined) {
		return {
			success: false,
			code: ZipperError.NO_CHILDREN,
			message: "no children on focus",
		};
    }

	return {
		success: true,
		zipper: {
			focus: newFocus,
			context: newCtx,
            adapter: zipper.adapter,
		},
	};
}

function insertLeft<Item>(zipper: Zipper<Item>, node: Item): ZipperResult<Item> {
    const ctx = zipper.context;

	if (ctx.kind === ContextVariant.ROOT) {
		return {
			success: false,
			code: ZipperError.AT_ROOT,
			message: "cannot insert siblings at top",
		};
	}

    const { parent, parent_context, left_siblings, right_siblings } = ctx;
    const new_left_siblings = [...left_siblings, node];

	return {
		success: true,
		zipper: {
			focus: zipper.focus,
			context: {
                ...ctx,
				left_siblings: new_left_siblings,
			},
            adapter: zipper.adapter,
		},
	};
}

function insertRight<Item>(zipper: Zipper<Item>, node: Item): ZipperResult<Item> {
    const ctx = zipper.context;

	if (ctx.kind === ContextVariant.ROOT) {
		return {
			success: false,
			code: ZipperError.AT_ROOT,
			message: "cannot insert siblings at top",
		};
	}

    const { parent, parent_context, left_siblings, right_siblings } = ctx;
    const new_right_siblings = [node, ...right_siblings];

	return {
		success: true,
		zipper: {
			focus: zipper.focus,
			context: {
                ...ctx,
				right_siblings: new_right_siblings,
			},
            adapter: zipper.adapter,
		},
	};
}

function insertDown<Item>(zipper: Zipper<Item>, node: Item): ZipperResult<Item> {
    if (zipper.adapter.isLeaf(zipper.focus)) {
		return {
			success: false,
			code: ZipperError.LEAF_NODE,
			message: "focus cannot contain children",
		};
    }

    const children = zipper.adapter.getChildren(zipper.focus);
    
	return {
		success: true,
		zipper: {
			focus: node,
			context: {
				kind: ContextVariant.CHILD,
                parent: zipper.focus,
                parent_context: zipper.context,
                left_siblings: [],
                right_siblings: children,
            },
            adapter: zipper.adapter,
		},
	};
}

function replace<Item>(zipper: Zipper<Item>, node: Item): ZipperResult<Item> {
	return {
		success: true,
		zipper: {
			focus: node,
			context: zipper.context,
            adapter: zipper.adapter,
		},
	};
}

/**
 * Goes to the next node in pre-order DFS
 * @param zipper to traverse
 */
function goNext<Item>(zipper: Zipper<Item>): ZipperResult<Item> {
	const down = goDown(zipper);

	if (down.success) {
		return down;
	}

	const right = goRight(zipper);

	if (right.success) {
		return right;
	}

	let currZip: Zipper<Item> = zipper;
	while (true) {
		const up = goUp(currZip);

		if (up.success) {
			const right = goRight(up.zipper);

			if (right.success) {
				return right;
			} else {
				currZip = up.zipper;
			}
		} else if (up.code === ZipperError.AT_ROOT) {
			break;
		}
	}

	return {
		success: false,
		code: ZipperError.AT_END,
		message: "reached the end of the tree",
	};
}

/**
 * Goes to the previous node in pre-order DFS
 * @param zipper to traverse
 */
function goPrevious<Item>(zipper: Zipper<Item>): ZipperResult<Item> {
	const left = goLeft(zipper);
	if (left.success) {
		const down = goDown(left.zipper);

		if (down.success) {
			if (down.zipper.context.kind === ContextVariant.ROOT) {
				return {
					success: false,
					code: ZipperError.IMPOSSIBLE_STATE,
					message: "zipper should not return a ContextVariant ROOT after going down",
				};
			}

			const { parent, parent_context, left_siblings, right_siblings } = down.zipper.context;
			const children = [...left_siblings, down.zipper.focus, ...right_siblings];
			const right_most_child = children[children.length - 1];

			if (right_most_child === undefined) {
				return {
					success: false,
					code: ZipperError.IMPOSSIBLE_STATE,
					message: "there must be at least one element in an array of [...left_siblings, focus, ...right_siblings]",
				};
			}

			return {
				success: true,
				zipper: {
					focus: right_most_child,
					context: {
						kind: ContextVariant.CHILD,
						left_siblings: children.slice(0, -1),
						right_siblings: [],
						parent: parent,
						parent_context: parent_context,
					},
					adapter: zipper.adapter,
				},
			};
		}

		return left;
	}

	const up = goUp(zipper);

	if (up.success) {
		return up;
	} else {
        return {
            success: false,
            code: ZipperError.AT_ROOT,
            message: "no previous at root",
        };
	}
}

/**
 * Peeks at the next node in pre-order DFS
 * @param zipper to peek from
 */
function peekNext<Item>(zipper: Zipper<Item>): PeekResult<Item> {
	const next = goNext(zipper);

	if (next.success) {
		return {
			success: true,
			item: next.zipper.focus,
		};
	} else {
		return {
			success: false,
			code: next.code,
			message: next.message,
		};
	}
}

/**
 * Peeks at the previous node in pre-order DFS
 * @param zipper to peek from
 */
function peekPrevious<Item>(zipper: Zipper<Item>): PeekResult<Item> {
	const prev = goPrevious(zipper);

	if (prev.success) {
		return {
			success: true,
			item: prev.zipper.focus,
		};
	} else {
		return {
			success: false,
			code: prev.code,
			message: prev.message,
		};
	}
}

/**
 * Goes to the root of the tree
 * @param zipper to traverse
 */
export function goTop<Item>(zipper: Zipper<Item>): ZipperResult<Item> {
	let current = zipper;

	while (true) {
		const up = goUp(current);

		if (up.success) {
			current = up.zipper;
		} else if (up.code === ZipperError.AT_ROOT) {
			return {
				success: true,
				zipper: current,
			};
		} else {
			// Unexpected error
			return up;
		}
	}
}

export {
	goLeft,
	goRight,
	goUp,
	goDown,
	insertLeft,
	insertRight,
	insertDown,
	replace,
	goNext,
	goPrevious,
	peekNext,
	peekPrevious,
};