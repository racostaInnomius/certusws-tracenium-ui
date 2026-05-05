import * as React from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Box,
  MenuItem,
  Switch,
  FormControlLabel,
} from "@mui/material";

const PLATFORM_OPTIONS = ["windows", "macos", "linux"];
const ARCH_OPTIONS = ["x64", "arm64", "x86"];
const FORMAT_OPTIONS = ["exe", "msi", "pkg", "dmg", "deb", "rpm", "tar.gz"];
const CHANNEL_OPTIONS = ["stable", "beta", "rc"];

export default function AgentReleaseDialog({
  open,
  mode,
  item,
  submitting,
  onClose,
  onSubmit,
}) {
  const [name, setName] = React.useState("");
  const [platform, setPlatform] = React.useState("windows");
  const [arch, setArch] = React.useState("x64");
  const [format, setFormat] = React.useState("msi");
  const [version, setVersion] = React.useState("latest");
  const [channel, setChannel] = React.useState("stable");
  const [downloadPath, setDownloadPath] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [isActive, setIsActive] = React.useState(true);

  React.useEffect(() => {
    if (open) {
      setName(item?.name || "");
      setPlatform(item?.platform || "windows");
      setArch(item?.arch || "x64");
      setFormat(item?.format || "msi");
      setVersion(item?.version || "latest");
      setChannel(item?.channel || "stable");
      setDownloadPath(item?.downloadPath || "");
      setDescription(item?.description || "");
      setIsActive(Boolean(item?.isActive ?? true));
    } else {
      setName("");
      setPlatform("windows");
      setArch("x64");
      setFormat("msi");
      setVersion("latest");
      setChannel("stable");
      setDownloadPath("");
      setDescription("");
      setIsActive(true);
    }
  }, [open, item]);

  const isDisabled =
    !String(name).trim() ||
    !String(platform).trim() ||
    !String(arch).trim() ||
    !String(format).trim() ||
    !String(version).trim() ||
    !String(channel).trim() ||
    !String(downloadPath).trim();

  const handleSubmit = () => {
    onSubmit?.({
      name: String(name).trim(),
      platform,
      arch,
      format,
      version: String(version).trim(),
      channel,
      downloadPath: String(downloadPath).trim(),
      description: String(description).trim(),
      isActive,
    });
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>
        {mode === "edit" ? "Edit Agent Release" : "Add Agent Release"}
      </DialogTitle>

      <DialogContent>
        <Box
          sx={{
            display: "grid",
            gap: 2,
            pt: 1,
            gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" },
          }}
        >
          <TextField
            label="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            fullWidth
            required
            sx={{ gridColumn: { xs: "span 1", sm: "span 2" } }}
          />

          <TextField
            select
            label="Platform"
            value={platform}
            onChange={(e) => setPlatform(e.target.value)}
            fullWidth
          >
            {PLATFORM_OPTIONS.map((opt) => (
              <MenuItem key={opt} value={opt}>
                {opt}
              </MenuItem>
            ))}
          </TextField>

          <TextField
            select
            label="Architecture"
            value={arch}
            onChange={(e) => setArch(e.target.value)}
            fullWidth
          >
            {ARCH_OPTIONS.map((opt) => (
              <MenuItem key={opt} value={opt}>
                {opt}
              </MenuItem>
            ))}
          </TextField>

          <TextField
            select
            label="Format"
            value={format}
            onChange={(e) => setFormat(e.target.value)}
            fullWidth
          >
            {FORMAT_OPTIONS.map((opt) => (
              <MenuItem key={opt} value={opt}>
                {opt}
              </MenuItem>
            ))}
          </TextField>

          <TextField
            select
            label="Channel"
            value={channel}
            onChange={(e) => setChannel(e.target.value)}
            fullWidth
          >
            {CHANNEL_OPTIONS.map((opt) => (
              <MenuItem key={opt} value={opt}>
                {opt}
              </MenuItem>
            ))}
          </TextField>

          <TextField
            label="Version"
            value={version}
            onChange={(e) => setVersion(e.target.value)}
            fullWidth
            helperText='Use values like "latest" or "1.0.85"'
          />

          <Box sx={{ display: "flex", alignItems: "center" }}>
            <FormControlLabel
              control={
                <Switch
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                />
              }
              label={isActive ? "Active" : "Inactive"}
            />
          </Box>

          <TextField
            label="Download Path"
            value={downloadPath}
            onChange={(e) => setDownloadPath(e.target.value)}
            fullWidth
            required
            sx={{ gridColumn: { xs: "span 1", sm: "span 2" } }}
            helperText='Example: /api/v1/binaries/agent?platform=windows&arch=x64&format=msi&version=latest'
          />

          <TextField
            label="Description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            fullWidth
            multiline
            minRows={3}
            sx={{ gridColumn: { xs: "span 1", sm: "span 2" } }}
          />
        </Box>
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={submitting || isDisabled}
        >
          {mode === "edit" ? "Save Changes" : "Create"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}