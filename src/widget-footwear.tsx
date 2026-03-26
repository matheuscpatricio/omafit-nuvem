import React from "react";
import { createRoot } from "react-dom/client";
import { FootwearWidgetPage } from "./widget-app/FootwearWidgetPage";

const mountNode = document.getElementById("app");

if (mountNode) {
	createRoot(mountNode).render(
		<React.StrictMode>
			<FootwearWidgetPage />
		</React.StrictMode>,
	);
}
