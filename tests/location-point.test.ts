import { expect, it } from "vitest";
import { locationNotes, parseLocationPoint } from "@/domain/locationPoint";
it("accepts exact coordinates with geographic bounds", () => {
  expect(parseLocationPoint("20.589, -103.44")).toEqual({ lat: 20.589, lng: -103.44 });
  expect(parseLocationPoint("91, 0")).toBeNull();
  expect(parseLocationPoint("0, -181")).toBeNull();
});
it("extracts Google Maps query coordinates", () => {
  expect(
    parseLocationPoint("https://www.google.com/maps/search/?api=1&query=20.589%2C-103.44"),
  ).toEqual({ lat: 20.589, lng: -103.44 });
});
it("prefers a place pin to the map viewport center", () => {
  expect(
    parseLocationPoint("https://www.google.com/maps/place/Test/@20,-103,15z/data=!3d21!4d-104"),
  ).toEqual({ lat: 21, lng: -104 });
});
it("does not treat a map viewport as an exact delivery pin", () => {
  expect(parseLocationPoint("https://www.google.com/maps/@20,-103,15z")).toBeNull();
});
it("rejects unrelated sites, short links and non-coordinate queries without fetching them", () => {
  expect(parseLocationPoint("https://other.example/?q=20,-103")).toBeNull();
  expect(parseLocationPoint("https://maps.app.goo.gl/test")).toBeNull();
  expect(parseLocationPoint("https://google.com/maps?q=street")).toBeNull();
});
it("keeps instructions and appends an explicit reference link", () => {
  expect(locationNotes("Puerta azul", { lat: 20, lng: -103 })).toContain(
    "Puerta azul · Ubicación de referencia: https://www.google.com/maps/",
  );
  expect(locationNotes("Puerta azul", null)).toBe("Puerta azul");
});
