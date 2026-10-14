from suite.www.suite import get_context as get_suite_context

no_cache = 1


def get_context(context):
    get_suite_context(context)
    context.title = "Photos"
    return context
