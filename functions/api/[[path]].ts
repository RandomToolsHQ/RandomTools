export const onRequest: PagesFunction<{ API: Fetcher }> = async (context) =>
  context.env.API.fetch(context.request);
