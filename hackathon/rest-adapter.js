const ROUTES = {
  "market-read": {
    action: "READ",
    resource: "market:public",
    data_class: "PUBLIC",
    environment: "DEVELOPMENT",
    external_side_effect: false
  },
  "production-crm-update": {
    action: "UPDATE",
    resource: "crm:customer",
    data_class: "INTERNAL",
    environment: "PRODUCTION",
    external_side_effect: true
  }
};

export class RestAssuranceAdapter {
  async describe({ target }) {
    const route = ROUTES[target];
    if (!route) throw new Error("Unknown REST target: " + target);
    return route;
  }

  async execute({ target, arguments: args = {} }) {
    return {
      transport: "REST",
      target,
      simulated: true,
      status: 200,
      body: {
        ok: true,
        target,
        received: args,
        message: "SIMULATED REST EXECUTION"
      }
    };
  }
}
