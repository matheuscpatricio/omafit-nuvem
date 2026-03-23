import React from "react";
import { createRoot } from "react-dom/client";
import { WidgetPage } from "./widget-app/WidgetPage";

const mountNode = document.getElementById("app");

if (mountNode) {
	createRoot(mountNode).render(
		<React.StrictMode>
			<WidgetPage />
		</React.StrictMode>,
	);
}
